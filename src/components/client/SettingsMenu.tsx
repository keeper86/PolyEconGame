'use client';

import type { LucideIcon } from 'lucide-react';
import { Check, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { locales, type Locale, type LocaleSetting } from '@/i18n/config';
import { LocaleFlag } from './LocaleFlag';

type ThemeName = 'light' | 'dark' | 'system';

const THEMES: { name: ThemeName; icon: LucideIcon }[] = [
    { name: 'light', icon: Sun },
    { name: 'dark', icon: Moon },
    { name: 'system', icon: Monitor },
];

export function SettingsMenu({ explicitLocale }: { explicitLocale: Locale | null }) {
    const t = useTranslations('Settings');
    const { theme, setTheme } = useTheme();
    const [isPending, startTransition] = useTransition();

    const changeLocale = (locale: LocaleSetting) => {
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
                        <LocaleFlag locale={locale} />
                        {t(locale)}
                        {explicitLocale === locale ? <Check className='ml-auto' /> : null}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => changeLocale('system')}>
                    <Monitor />
                    {t('system')}
                    {explicitLocale === null ? <Check className='ml-auto' /> : null}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
