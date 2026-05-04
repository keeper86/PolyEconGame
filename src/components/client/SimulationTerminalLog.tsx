/**
 * components/client/SimulationTerminalLog.tsx
 *
 * Expanded terminal-style log that displays all simulation events in
 * chronological order.  Auto-scrolls to the bottom unless the user has
 * manually scrolled up.
 *
 * Clicking anywhere on the log collapses it back to the ticker.
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { TickerEvent } from '@/server/controller/simulation';
import { cn } from '@/lib/utils';

interface SimulationTerminalLogProps {
    events: TickerEvent[];
    onCollapse: () => void;
    className?: string;
}

/** Map event categories to a text colour class for the terminal. */
function categoryTextColor(category: string): string {
    switch (category) {
        case 'agentCreated':
        case 'facilityCompleted':
        case 'shipCompleted':
        case 'licenseAcquired':
            return 'text-green-400';
        case 'shipDispatched':
        case 'shipArrived':
            return 'text-blue-400';
        case 'agentBankrupt':
        case 'loanRollover':
            return 'text-red-400';
        case 'contractAccepted':
            return 'text-yellow-400';
        case 'priceSpike':
            return 'text-orange-400';
        case 'populationMilestone':
            return 'text-purple-400';
        default:
            return 'text-gray-400';
    }
}

export function SimulationTerminalLog({ events, onCollapse, className }: SimulationTerminalLogProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const userScrolledUpRef = useRef(false);

    // Track whether the user has manually scrolled up
    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = container;
        userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 50;
    }, []);

    // Auto-scroll to bottom when new events arrive (unless user scrolled up)
    useEffect(() => {
        if (!userScrolledUpRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [events.length]);

    // Scroll to bottom on initial render
    useEffect(() => {
        bottomRef.current?.scrollIntoView();
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCollapse();
            }
        },
        [onCollapse],
    );

    return (
        <div
            className={cn(
                'relative rounded-md border bg-black/90 text-xs font-mono',
                'flex flex-col cursor-pointer',
                className,
            )}
            onClick={onCollapse}
            onKeyDown={handleKeyDown}
            role='button'
            tabIndex={0}
            aria-label='Simulation event log. Click to collapse.'
            aria-expanded={true}
        >
            {/* Header bar */}
            <div className='flex items-center justify-between px-3 py-1.5 border-b border-white/10 shrink-0'>
                <span className='text-white/60 text-[10px] uppercase tracking-wider font-semibold'>
                    Event Log ({events.length} events)
                </span>
                <span className='text-white/30 text-[10px] uppercase tracking-wider'>Click to close</span>
            </div>

            {/* Scrollable event list — stop click propagation so scrolling doesn't collapse */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className='flex-1 overflow-y-auto p-2 space-y-0.5 cursor-auto'
                onClick={(e) => e.stopPropagation()}
                tabIndex={0}
                role='list'
                aria-label='Events'
            >
                {events.length === 0 && <div className='text-white/30 italic p-2'>No events yet…</div>}
                {events.map((event) => (
                    <div
                        key={event.id}
                        role='listitem'
                        className='flex items-start gap-2 leading-5 py-0.5 px-1 rounded hover:bg-white/5 transition-colors'
                    >
                        {/* Timestamp / tick */}
                        <span className='text-white/40 shrink-0 w-14 text-right select-none'>T{event.tick}</span>

                        {/* Category badge */}
                        <span
                            className={cn(
                                'shrink-0 text-[10px] uppercase tracking-wider font-semibold w-24 text-right select-none',
                                categoryTextColor(event.category),
                            )}
                        >
                            {event.category}
                        </span>

                        {/* Message */}
                        <span className='text-white/90 break-words min-w-0'>{event.message}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
