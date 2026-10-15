'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { MousePointerClick } from 'lucide-react';
import type { TooltipRenderProps } from 'react-joyride';
import { useTranslations } from 'next-intl';

export function TourTooltip({
    continuous,
    index,
    isLastStep,
    size,
    step,
    backProps,
    closeProps,
    primaryProps,
    tooltipProps,
    skipProps: _skipProps,
}: TooltipRenderProps) {
    const t = useTranslations('Tour');
    const { title, content } = step;
    const isBlocking = (step.data as Record<string, unknown> | undefined)?.blocking === true;

    return (
        <Card
            {...(tooltipProps as React.HTMLAttributes<HTMLDivElement>)}
            role='alertdialog'
            className='min-w-[320px] max-w-[420px] max-h-[80vh] overflow-y-auto shadow-xl border bg-card text-card-foreground'
        >
            <button
                {...closeProps}
                className='absolute top-3 right-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-6 w-6 text-muted-foreground cursor-pointer'
                aria-label={t('close')}
            >
                ✕
            </button>

            <CardHeader className='pb-2 pr-8'>
                {title && <h3 className='text-base font-semibold leading-tight tracking-tight'>{title}</h3>}
            </CardHeader>

            <CardContent>
                <div className='text-sm text-muted-foreground leading-relaxed'>{content}</div>

                {isBlocking && (
                    <div className='mt-3 flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-2.5 dark:border-amber-500/60 dark:bg-amber-950/40'>
                        <MousePointerClick className='mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400' />
                        <div className='space-y-0.5'>
                            <p className='text-xs font-semibold text-amber-700 dark:text-amber-300'>
                                {t('blockingTitle')}
                            </p>
                            <p className='text-xs text-amber-700/90 dark:text-amber-200/90'>{t('blockingHint')}</p>
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter className='flex items-center justify-between gap-2 pt-2'>
                <div className='flex items-center gap-2'>
                    {size > 1 && (
                        <span className='text-xs text-muted-foreground tabular-nums'>
                            {index + 1} {t('of')} {size}
                        </span>
                    )}
                </div>

                <div className='flex items-center gap-1.5'>
                    {index > 0 && (
                        <Button {...backProps} data-action='back' variant='outline' size='sm' className='text-xs h-8'>
                            {t('back')}
                        </Button>
                    )}

                    {continuous && !isBlocking && (
                        <Button
                            {...primaryProps}
                            data-action='primary'
                            variant='default'
                            size='sm'
                            className='text-xs h-8'
                        >
                            {isLastStep ? t('finish') : t('next')}
                        </Button>
                    )}

                    {continuous && isBlocking && (
                        <Button
                            disabled
                            data-action='blocked'
                            variant='outline'
                            size='sm'
                            className='text-xs h-8 gap-1.5 border-amber-400 text-amber-700 dark:border-amber-500/60 dark:text-amber-300'
                        >
                            <MousePointerClick className='h-3.5 w-3.5' />
                            {t('blockingWaiting')}
                        </Button>
                    )}
                </div>
            </CardFooter>
        </Card>
    );
}
