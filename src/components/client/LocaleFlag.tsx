import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';

const VIEWBOX = '0 0 24 16';

const UNITED_KINGDOM = (
    <>
        <rect width='24' height='16' fill='#012169' />
        <path d='M0 0 L24 16 M24 0 L0 16' stroke='#ffffff' strokeWidth='3' />
        <path d='M0 0 L24 16 M24 0 L0 16' stroke='#c8102e' strokeWidth='1.2' />
        <path d='M12 0 V16 M0 8 H24' stroke='#ffffff' strokeWidth='5' />
        <path d='M12 0 V16 M0 8 H24' stroke='#c8102e' strokeWidth='3' />
    </>
);

const GERMANY = (
    <>
        <rect width='24' height='16' fill='#000000' />
        <rect y='5.33' width='24' height='5.34' fill='#dd0000' />
        <rect y='10.67' width='24' height='5.33' fill='#ffce00' />
    </>
);

const FLAGS: Record<Locale, ReactNode> = {
    en: UNITED_KINGDOM,
    de: GERMANY,
};

export function LocaleFlag({ locale, size = 16 }: { locale: Locale; size?: number }) {
    return (
        <svg
            viewBox={VIEWBOX}
            width={size}
            height={(size * 2) / 3}
            className='rounded-[2px] shrink-0'
            aria-hidden='true'
        >
            {FLAGS[locale]}
        </svg>
    );
}
