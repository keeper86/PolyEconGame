import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
    interface NoAuthSession {
        type: 'no-auth';
        user: null;
    }

    interface Session {
        type: 'next-auth';
        accessToken: string;
        user: {
            id: string;
            name?: string;
            displayName?: string;
            hasAssessmentPublished?: boolean;
            email: string;
        };
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        accessToken?: string;
        idToken?: string;
        userId?: string;
    }
}
