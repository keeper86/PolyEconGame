'use client';

import type { LucideIcon } from 'lucide-react';
import { Check, Globe, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setLocale } from '@/i18n/actions';
import { locales, type Locale } from '@/i18n/config';

type ThemeName = 'light' | 'dark' | 'system';

const THEMES: { name: ThemeName; icon: LucideIcon }[] = [
    { name: 'light', icon: Sun },
    { name: 'dark', icon: Moon },
    { name: 'system', icon: Monitor },
];

export function SettingsMenu() {
    const t = useTranslations('Settings');
    const { theme, setTheme } = useTheme();
    const activeLocale = useLocale();
    const [isPending, startTransition] = useTransition();

    const changeLocale = (locale: Locale) => {
        startTransition(async () => {
            await setLocale(locale);
        });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant='outline' size='icon' disabled={isPending} aria-label={t('title')}>
                    <Settings className='h-[1.2rem] w-[1.2rem]' />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-44'>
                <DropdownMenuLabel>{t('theme')}</DropdownMenuLabel>
                {THEMES.map(({ name, icon: Icon }) => (
                    <DropdownMenuItem key={name} onClick={() => setTheme(name)}>
                        <Icon />
                        {t(name)}
                        {theme === name ? <Check className='ml-auto' /> : null}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
                {locales.map((locale) => (
                    <DropdownMenuItem key={locale} onClick={() => changeLocale(locale)}>
                        <Globe />
                        {t(locale)}
                        {locale === activeLocale ? <Check className='ml-auto' /> : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
