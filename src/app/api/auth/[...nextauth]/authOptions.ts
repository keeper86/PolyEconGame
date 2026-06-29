import KeycloakProvider from 'next-auth/providers/keycloak';
import { db } from '@/server/db';
import { logger } from '@/server/logger';
import type { AuthOptions } from 'next-auth';

export const authOptions: AuthOptions = {
    providers: [
        KeycloakProvider({
            clientId: process.env.KEYCLOAK_CLIENT_ID!,
            clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
            issuer: process.env.KEYCLOAK_ISSUER!,
        }),
    ],
    callbacks: {
        async signIn({ account, profile, user }) {
            try {
                const userId = account?.providerAccountId ?? profile?.sub;
                if (!userId) {
                    logger.debug({ component: 'auth-signin' }, 'No userId present on signIn; skipping provisioning');
                    return true;
                }

                const email = profile?.email ?? user?.email;
                if (!email) {
                    logger.warn(
                        { component: 'auth-signin' },
                        `No email available for ${userId}; skipping provisioning`,
                    );
                    return true;
                }

                const displayName = profile?.name ?? user?.name ?? 'No name set';

                await db('user_data')
                    .insert({ user_id: userId, display_name: displayName, email, has_assessment_published: false })
                    .onConflict('user_id')
                    .merge();

                logger.debug({ component: 'auth-signin' }, `Provisioned user_data for ${userId}`);
            } catch (err) {
                logger.error(
                    { component: 'auth-signin', err },
                    'Failed to provision user on signIn. Continuing signIn.',
                );
            }

            return true;
        },
        async jwt(thing) {
            const { token, account, profile } = thing;
            if (account) {
                token.accessToken = account.access_token;
                token.idToken = account.id_token;
                token.userId = account.providerAccountId || profile?.sub;

                // Fetch user_data once on sign-in and store in JWT to avoid a DB query on every request.
                if (token.userId) {
                    try {
                        const row = await db('user_data').where({ user_id: token.userId }).first();
                        if (row) {
                            token.displayName = row.display_name;
                            token.email = row.email;
                            token.hasAssessmentPublished = row.has_assessment_published;
                        } else {
                            logger.debug(
                                { component: 'auth-jwt' },
                                `No user_data found for ${token.userId} during token enrichment;`,
                            );
                        }
                    } catch (err) {
                        logger.error({ component: 'auth-jwt', err }, 'Failed to load user_data on jwt callback');
                    }
                }
            }
            return token;
        },
        async session({ session, token }) {
            session.type = 'next-auth';
            if (token.accessToken) {
                session.accessToken = token.accessToken;
            }

            if (token.userId) {
                session.user = {
                    id: token.userId,
                    email: token.email ?? '',
                    displayName: token.displayName ?? undefined,
                    hasAssessmentPublished: token.hasAssessmentPublished ?? false,
                };
            } else {
                logger.debug({ component: 'auth-session' }, 'No userId present on token; skipping user enrichment');
            }

            return session;
        },
    },
};
