'use client';

import { Check } from 'lucide-react';
import { ImFilter } from 'react-icons/im';
import { useTranslations } from 'next-intl';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    useEventCategoriesPreference,
    useEventsHideAutomatedPreference,
    useEventsLocalPlanetOnlyPreference,
    useEventsShowHrCompletionPreference,
} from '@/hooks/uiPreferences';
import { TICKER_EVENT_CATEGORIES, type TickerEventCategory } from '@/lib/tickerEventCategories';
import { cn } from '@/lib/utils';

export function EventFilterMenu({ planetId }: { planetId?: string }) {
    const t = useTranslations('EventFilter');
    const [categories, setCategories] = useEventCategoriesPreference();
    const [hideAutomated, setHideAutomated] = useEventsHideAutomatedPreference();
    const [localPlanetOnly, setLocalPlanetOnly] = useEventsLocalPlanetOnlyPreference();
    const [showHrCompletion, setShowHrCompletion] = useEventsShowHrCompletionPreference();

    const toggleCategory = (category: TickerEventCategory) => {
        setCategories((prev) =>
            prev.includes(category) ? prev.filter((value) => value !== category) : [...prev, category],
        );
    };

    const checkClass = (active: boolean) => cn(active ? 'opacity-100' : 'opacity-0');

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className='shrink-0 h-full px-3 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-l border-border z-20'
                    aria-label={t('title')}
                    title={t('title')}
                >
                    <ImFilter className='h-5 w-5' />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-64'>
                <DropdownMenuLabel>{t('filters')}</DropdownMenuLabel>
                <DropdownMenuItem disabled={!planetId} onClick={() => setLocalPlanetOnly(!localPlanetOnly)}>
                    <Check className={checkClass(localPlanetOnly)} />
                    {t('localPlanetOnly')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setHideAutomated(!hideAutomated)}>
                    <Check className={checkClass(hideAutomated)} />
                    {t('hideAutomated')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowHrCompletion(!showHrCompletion)}>
                    <Check className={checkClass(showHrCompletion)} />
                    {t('showHrCompletion')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('types')}</DropdownMenuLabel>
                {TICKER_EVENT_CATEGORIES.map((category) => (
                    <DropdownMenuItem key={category} onClick={() => toggleCategory(category)}>
                        <Check className={checkClass(categories.includes(category))} />
                        {t(category)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
