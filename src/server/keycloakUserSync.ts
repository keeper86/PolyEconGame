import type { Knex } from 'knex';
import { db } from './db';
import { logger } from './logger';

const GLOBAL_KEY = Symbol.for('__polyecon_keycloak_user_sync__');
const g = globalThis as unknown as { [GLOBAL_KEY]?: boolean };

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [2000, 5000, 10000];

export type KeycloakUser = {
    id: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    serviceAccountClientId?: string;
};

export type KeycloakSyncConfig = {
    baseUrl: string;
    realm: string;
    clientId: string;
    clientSecret: string;
};

export type ProvisionRow = {
    user_id: string;
    email: string;
    username: string | null;
    display_name: string | null;
};

export type KeycloakSyncResult = {
    added: number;
    updated: number;
    unchanged: number;
    skipped: number;
};

export type FetchResponseLike = {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
};

export type FetchLike = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

export function resolveKeycloakSyncConfig(): KeycloakSyncConfig {
    const issuer = process.env.KEYCLOAK_ISSUER ?? '';
    if (!issuer.includes('/realms/')) {
        throw new Error('KEYCLOAK_ISSUER is not configured; cannot derive the Keycloak base URL');
    }
    const baseUrl = issuer.slice(0, issuer.indexOf('/realms/')).replace(/\/+$/, '');
    return {
        baseUrl,
        realm: process.env.KEYCLOAK_REALM ?? 'polyecongame',
        clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'polyecongame-app',
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
    };
}

export function keycloakUserToRow(user: KeycloakUser): ProvisionRow | null {
    if (!user.id || !user.email) {
        return null;
    }
    if (user.enabled === false || user.serviceAccountClientId) {
        return null;
    }
    if ((user.username ?? '').startsWith('service-account-')) {
        return null;
    }

    const displayName = [user.firstName, user.lastName]
        .map((part) => (part ?? '').trim())
        .filter((part) => part.length > 0)
        .join(' ')
        .trim();

    return {
        user_id: user.id,
        email: user.email,
        username: user.username ?? null,
        display_name: displayName.length > 0 ? displayName : null,
    };
}

async function fetchServiceAccountToken(
    config: KeycloakSyncConfig,
    fetchImpl: FetchLike,
    signal: AbortSignal,
): Promise<string> {
    const response = await fetchImpl(`${config.baseUrl}/realms/${config.realm}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.clientId,
            client_secret: config.clientSecret,
        }).toString(),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Keycloak token request failed with status ${response.status}`);
    }

    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) {
        throw new Error('Keycloak token response did not contain an access token');
    }
    return body.access_token;
}

async function fetchAllKeycloakUsers(
    config: KeycloakSyncConfig,
    token: string,
    fetchImpl: FetchLike,
    signal: AbortSignal,
): Promise<KeycloakUser[]> {
    const users: KeycloakUser[] = [];
    for (let first = 0; ; first += PAGE_SIZE) {
        const response = await fetchImpl(
            `${config.baseUrl}/admin/realms/${config.realm}/users?first=${first}&max=${PAGE_SIZE}&briefRepresentation=false`,
            { headers: { Authorization: `Bearer ${token}` }, signal },
        );

        if (!response.ok) {
            throw new Error(`Keycloak users request failed with status ${response.status}`);
        }

        const page = (await response.json()) as KeycloakUser[];
        users.push(...page);
        if (page.length < PAGE_SIZE) {
            return users;
        }
    }
}

export async function reconcileKeycloakUsers(database: Knex, rows: ProvisionRow[]): Promise<KeycloakSyncResult> {
    if (rows.length === 0) {
        return { added: 0, updated: 0, unchanged: 0, skipped: 0 };
    }

    const existing: { user_id: string; email: string; username: string | null }[] = await database('user_data')
        .whereIn(
            'user_id',
            rows.map((row) => row.user_id),
        )
        .select('user_id', 'email', 'username');
    const existingById = new Map(existing.map((row) => [row.user_id, row]));

    const toInsert: ProvisionRow[] = [];
    const toUpdate: ProvisionRow[] = [];
    for (const row of rows) {
        const current = existingById.get(row.user_id);
        if (!current) {
            toInsert.push(row);
            continue;
        }
        if (current.email !== row.email || (current.username ?? null) !== row.username) {
            toUpdate.push(row);
        }
    }

    if (toInsert.length > 0) {
        await database('user_data').insert(toInsert).onConflict('user_id').ignore();
    }

    for (const row of toUpdate) {
        await database('user_data')
            .where({ user_id: row.user_id })
            .update({ email: row.email, username: row.username });
    }

    return {
        added: toInsert.length,
        updated: toUpdate.length,
        unchanged: rows.length - toInsert.length - toUpdate.length,
        skipped: 0,
    };
}

export async function syncKeycloakUsers(options?: {
    database?: Knex;
    fetchImpl?: FetchLike;
    config?: KeycloakSyncConfig;
    signal?: AbortSignal;
}): Promise<KeycloakSyncResult> {
    const database = options?.database ?? db;
    const fetchImpl = options?.fetchImpl ?? (fetch as unknown as FetchLike);
    const config = options?.config ?? resolveKeycloakSyncConfig();
    const signal = options?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    const token = await fetchServiceAccountToken(config, fetchImpl, signal);
    const users = await fetchAllKeycloakUsers(config, token, fetchImpl, signal);

    const rows: ProvisionRow[] = [];
    let skipped = 0;
    for (const user of users) {
        const row = keycloakUserToRow(user);
        if (row) {
            rows.push(row);
        } else {
            skipped += 1;
        }
    }

    const result = await reconcileKeycloakUsers(database, rows);
    return { ...result, skipped };
}

export function scheduleKeycloakUserSync(): void {
    if (g[GLOBAL_KEY]) {
        return;
    }
    g[GLOBAL_KEY] = true;
    void runKeycloakUserSyncWithRetries();
}

async function runKeycloakUserSyncWithRetries(): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            const result = await syncKeycloakUsers();
            logger.info({ component: 'keycloak-user-sync', ...result }, 'Synced Keycloak users into user_data');
            return;
        } catch (err) {
            if (attempt >= RETRY_DELAYS_MS.length) {
                logger.warn(
                    { component: 'keycloak-user-sync', err },
                    'Could not sync Keycloak users; continuing without it',
                );
                return;
            }
            await delay(RETRY_DELAYS_MS[attempt]);
        }
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
