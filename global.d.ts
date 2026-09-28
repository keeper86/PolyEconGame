import type { Locale } from './src/i18n/config';
import type { formats } from './src/i18n/formats';
import type messages from './messages/en.json';

declare module 'next-intl' {
    interface AppConfig {
        Locale: Locale;
        Messages: typeof messages;
        Formats: typeof formats;
    }
}
