'use client';

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { RecipientCandidate } from '@/lib/recipientSearch';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';

export const recipientLabel = (recipient: RecipientCandidate): string => {
    const name = recipient.displayName ?? recipient.companyName ?? recipient.userId;
    if (recipient.companyName && recipient.displayName && recipient.companyName !== recipient.displayName) {
        return `${name} (${recipient.companyName})`;
    }
    return name;
};

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
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

    const { data, isFetching } = useQuery({
        ...trpc.message.listRecipients.queryOptions({ search: debouncedSearch, limit: RESULT_LIMIT }),
        placeholderData: keepPreviousData,
    });
    const recipients = data?.recipients ?? [];

    return (
        <Command shouldFilter={false} label='Recipient' className='rounded-md border'>
            <CommandInput placeholder='Search by name, company or id…' value={search} onValueChange={setSearch} />
            <CommandList className='max-h-56'>
                <CommandEmpty>{isFetching ? 'Searching…' : 'No player found.'}</CommandEmpty>
                {recipients.map((recipient) => (
                    <CommandItem key={recipient.userId} value={recipient.userId} onSelect={() => onChange(recipient)}>
                        <Check
                            className={cn(
                                'mr-2 h-4 w-4',
                                value?.userId === recipient.userId ? 'opacity-100' : 'opacity-0',
                            )}
                        />
                        <span className='truncate'>{recipientLabel(recipient)}</span>
                    </CommandItem>
                ))}
            </CommandList>
        </Command>
    );
}
