import { getCaller, getDb, getUnauthenticatedCaller, testUsers } from 'tests/vitest/setupTestcontainer';
import { describe, expect, it } from 'vitest';
import type { UserSummary } from './user';
import { deleteAgentMonthlyHistory } from '@/simulation/gameSnapshotRepository';

describe('user endpoint (integration)', async () => {
    it('get users with pagination', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const result = await caller.getUsers({ limit: 10, offset: 0 });
        expect(result).toHaveProperty('users');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.users)).toBe(true);

        const users = Object.values(testUsers);

        expect(result.total).toBe(users.length + 1);
        expect(result.users).toEqual(
            expect.arrayContaining(
                users.map((u) =>
                    expect.objectContaining({
                        userId: u.user_id,
                    }),
                ),
            ),
        );
    });

    it('get user by ID', async () => {
        const caller = getCaller('somebody-else-id');

        const user = await caller.getUser({ userId: testUsers.testUser.user_id });
        expect(user.userId).toBe(testUsers.testUser.user_id);
    });

    it('update user information', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const updateData: UserSummary = {
            userId: testUsers.testUser.user_id,
            displayName: 'Updated User',
            hasAssessmentPublished: true,
        };

        await caller.updateUser(updateData);

        const updatedUser = await caller.getUser({ userId: testUsers.testUser.user_id });
        expect(updatedUser).toHaveProperty('displayName', 'Updated User');
        expect(updatedUser).toHaveProperty('hasAssessmentPublished', true);
    });

    it('getting user without a session should fail', async () => {
        const anonCaller = getUnauthenticatedCaller();

        await expect(anonCaller.getUser({ userId: testUsers.testUser.user_id })).rejects.toThrow();
    });

    it('pagination with only published assessments', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const result = await caller.getUsers({
            limit: 10,
            offset: 0,
            onlyWithPublishedAssessments: true,
        });

        expect(result).toHaveProperty('users');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.users)).toBe(true);
    });

    it('getMyBankruptcy returns null when the user has no company', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        const result = await caller.simulation.getMyBankruptcy();

        expect(result).toEqual({ bankruptcy: null });
    });

    it('acknowledgeBankruptcy fails when the user has no company', async () => {
        const caller = getCaller(testUsers.testUser.user_id);

        await expect(caller.acknowledgeBankruptcy()).rejects.toThrow();
    });
});

describe('deleteAgentMonthlyHistory', () => {
    it('removes only the history rows of the given agent', async () => {
        const db = getDb();
        const target = { tick: '900000001', agent_id: 'gone-history-co', planet_id: 'p1' };
        const other = { tick: '900000002', agent_id: 'other-history-co', planet_id: 'p2' };

        const row = (tick: string, agentId: string, planetId: string) => ({
            tick,
            planet_id: planetId,
            agent_id: agentId,
            net_balance: 100,
            asset_value: 200,
            monthly_net_income: 30,
            total_workers: 5,
            wages: 50,
            production_value: 60,
            consumption_value: 20,
            facility_count: 1,
            storage_value: 10,
            purchases: 5,
            claim_payments: 0,
        });

        await db('agent_monthly_history').insert([
            row(target.tick, target.agent_id, target.planet_id),
            row(target.tick, target.agent_id, 'p2'),
            row(other.tick, other.agent_id, other.planet_id),
        ]);

        await deleteAgentMonthlyHistory(db, target.agent_id);

        const remaining = await db('agent_monthly_history').where({ agent_id: target.agent_id });
        expect(remaining).toHaveLength(0);

        const otherRows = await db('agent_monthly_history').where({ agent_id: other.agent_id });
        expect(otherRows).toHaveLength(1);
    });
});
