'use client';

import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setLocale } from '@/i18n/actions';
import { locales, type Locale } from '@/i18n/config';

export function LocaleSwitcher() {
    const activeLocale = useLocale();
    const t = useTranslations('LocaleSwitcher');
    const [isPending, startTransition] = useTransition();

    const change = (locale: Locale) => {
        startTransition(async () => {
            await setLocale(locale);
        });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant='outline' size='icon' disabled={isPending}>
                    <Globe className='h-[1.2rem] w-[1.2rem]' />
                    <span className='sr-only'>{t('label')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
                {locales.map((locale) => (
                    <DropdownMenuItem key={locale} disabled={locale === activeLocale} onClick={() => change(locale)}>
                        {t(locale)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
