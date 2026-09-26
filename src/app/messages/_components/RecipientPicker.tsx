'use client';

import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { recipientLabel, type RecipientCandidate } from '@/lib/recipientSearch';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 200;
const RESULT_LIMIT = 50;

export function RecipientPicker({
    value,
    onChange,
}: {
    value: RecipientCandidate | null;
    onChange: (recipient: RecipientCandidate | null) => void;
}) {
    const trpc = useTRPC();
    const containerRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlighted, setHighlighted] = useState(0);
    const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

    const { data, isFetching } = useQuery({
        ...trpc.message.listRecipients.queryOptions({ search: debouncedQuery, limit: RESULT_LIMIT }),
        placeholderData: keepPreviousData,
        enabled: open,
    });
    const recipients = data?.recipients ?? [];

    useEffect(() => {
        if (!open) {
            return;
        }
        const handlePointerDown = (event: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    const close = () => {
        setOpen(false);
        setQuery('');
    };

    const select = (recipient: RecipientCandidate) => {
        onChange(recipient);
        close();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlighted((index) => Math.min(index + 1, recipients.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlighted((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Enter') {
            const recipient = recipients[highlighted];
            if (recipient) {
                event.preventDefault();
                select(recipient);
            }
        } else if (event.key === 'Escape') {
            close();
        }
    };

    const activeIndex = Math.min(highlighted, Math.max(recipients.length - 1, 0));

    return (
        <div ref={containerRef} className='relative'>
            <Input
                value={open ? query : value ? recipientLabel(value) : ''}
                readOnly={!open}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlighted(0);
                }}
                onFocus={() => {
                    if (!open) {
                        setOpen(true);
                        setQuery('');
                        setHighlighted(0);
                    }
                }}
                onKeyDown={handleKeyDown}
                placeholder='Search by name or company…'
                className={cn(value && !open && 'pr-8')}
            />

            {value && !open && (
                <button
                    type='button'
                    aria-label='Clear recipient'
                    onClick={() => onChange(null)}
                    className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                >
                    <X className='h-4 w-4' />
                </button>
            )}

            {open && (
                <div className='absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md'>
                    {recipients.length === 0 ? (
                        <div className='px-2 py-6 text-center text-sm text-muted-foreground'>
                            {isFetching ? 'Searching…' : 'No player found.'}
                        </div>
                    ) : (
                        recipients.map((recipient, index) => (
                            <button
                                key={recipient.userId}
                                type='button'
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setHighlighted(index)}
                                onClick={() => select(recipient)}
                                className={cn(
                                    'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm',
                                    index === activeIndex && 'bg-accent text-accent-foreground',
                                )}
                            >
                                <span className='truncate'>{recipientLabel(recipient)}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
