import type { Formats } from 'next-intl';

export const formats = {
    dateTime: {
        timestamp: {
            dateStyle: 'medium',
            timeStyle: 'short',
        },
    },
} as const satisfies Formats;
