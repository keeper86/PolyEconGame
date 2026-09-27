import { IntlErrorCode } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale } from './config';

export default getRequestConfig(async () => {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get('accept-language'));

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default,
        onError(error) {
            if (error.code === IntlErrorCode.MISSING_MESSAGE) {
                console.error(error);
            }
        },
    };
});
