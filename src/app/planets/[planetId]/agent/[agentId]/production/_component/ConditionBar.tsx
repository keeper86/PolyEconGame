import { Progress } from '@/components/ui/progress';
import { Wrench } from 'lucide-react';
import React from 'react';
import { useTranslations } from 'next-intl';

export function conditionTone(status: number): { text: string; bar: string } {
    if (status >= 0.75) {
        return { text: 'text-green-600', bar: '[&>div]:bg-green-500' };
    }
    if (status >= 0.4) {
        return { text: 'text-yellow-600', bar: '[&>div]:bg-yellow-500' };
    }
    return { text: 'text-red-600', bar: '[&>div]:bg-red-500' };
}

export function ConditionBar({ status, max }: { status: number; max: number }): React.ReactElement {
    const t = useTranslations('Production');
    const tone = conditionTone(status);
    const fillPct = max > 0 ? Math.min(100, Math.max(0, (status / max) * 100)) : 0;

    return (
        <>
            <div className='flex flex-row w-full justify-between text-xs text-muted-foreground mb-1'>
                <span className='flex items-center gap-1.5'>
                    <Wrench className='h-3.5 w-3.5' />
                    {t('condition')}
                </span>
                <span className={`font-medium ${tone.text}`}>
                    {t('conditionMax', { current: Math.round(status * 100), max: Math.round(max * 100) })}
                </span>
            </div>
            <Progress value={fillPct} className={`h-2.5 ${tone.bar}`} />
        </>
    );
}
