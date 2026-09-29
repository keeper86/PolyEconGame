'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { isLocaleSetting, LOCALE_COOKIE, type LocaleSetting } from './config';

export async function setLocale(locale: LocaleSetting) {
    if (!isLocaleSetting(locale)) {
        throw new Error(`Unsupported locale: ${locale}`);
    }

    const cookieStore = await cookies();
    if (locale === 'system') {
        cookieStore.delete(LOCALE_COOKIE);
    } else {
        cookieStore.set(LOCALE_COOKIE, locale, {
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax',
        });
    }

    revalidatePath('/', 'layout');
}
