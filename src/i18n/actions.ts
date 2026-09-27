'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from './config';

export async function setLocale(locale: string) {
    if (!isLocale(locale)) {
        throw new Error(`Unsupported locale: ${locale}`);
    }

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
    });

    revalidatePath('/', 'layout');
}
