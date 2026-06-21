'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import type { TooltipRenderProps } from 'react-joyride';

/**
 * Custom tooltip component for react-joyride that uses shadcn Card and Button
 * components. This ensures consistent styling with the rest of the app,
 * including dark mode support via CSS variables.
 */
export function TourTooltip({
    continuous,
    index,
    isLastStep,
    size,
    step,
    backProps,
    closeProps,
    primaryProps,
    skipProps,
    tooltipProps,
}: TooltipRenderProps) {
    const { title, content } = step;

    return (
        <Card
            {...(tooltipProps as React.HTMLAttributes<HTMLDivElement>)}
            role='alertdialog'
            className='min-w-[320px] max-w-[420px] shadow-xl border bg-card text-card-foreground'
        >
            {/* Close button */}
            <button
                {...closeProps}
                className='absolute top-3 right-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-6 w-6 text-muted-foreground cursor-pointer'
                aria-label='Close'
            >
                ✕
            </button>

            <CardHeader className='pb-2 pr-8'>
                {title && <h3 className='text-base font-semibold leading-tight tracking-tight'>{title}</h3>}
            </CardHeader>

            <CardContent>
                <div className='text-sm text-muted-foreground leading-relaxed'>{content}</div>
            </CardContent>

            <CardFooter className='flex items-center justify-between gap-2 pt-2'>
                {/* Left side: progress indicator */}
                <div className='flex items-center gap-2'>
                    {size > 1 && (
                        <span className='text-xs text-muted-foreground tabular-nums'>
                            {index + 1} of {size}
                        </span>
                    )}

                    {/* Skip button */}
                    <Button {...skipProps} data-action='skip' variant='ghost' size='sm' className='text-xs h-7 px-2'>
                        Skip
                    </Button>
                </div>

                {/* Right side: back / next buttons */}
                <div className='flex items-center gap-1.5'>
                    {index > 0 && (
                        <Button {...backProps} data-action='back' variant='outline' size='sm' className='text-xs h-8'>
                            Back
                        </Button>
                    )}

                    {continuous && (
                        <Button
                            {...primaryProps}
                            data-action='primary'
                            variant='default'
                            size='sm'
                            className='text-xs h-8'
                        >
                            {isLastStep ? 'Finish' : 'Next'}
                        </Button>
                    )}
                </div>
            </CardFooter>
        </Card>
    );
}
