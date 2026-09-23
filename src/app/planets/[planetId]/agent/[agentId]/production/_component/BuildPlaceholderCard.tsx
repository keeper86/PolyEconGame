import { Card, CardContent } from '@/components/ui/card';
import { PlusCircle } from 'lucide-react';
import React from 'react';

export function BuildPlaceholderCard({
    label,
    onClick,
    dataTour,
}: {
    label: string;
    onClick: () => void;
    dataTour?: string;
}): React.ReactElement {
    return (
        <Card
            className='min-w-[300px] flex items-center justify-center cursor-pointer border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors'
            style={{ minHeight: '160px' }}
            onClick={onClick}
            data-tour={dataTour}
        >
            <CardContent className='flex flex-col items-center gap-2 p-6'>
                <PlusCircle className='h-8 w-8' />
                <span className='text-xs font-medium'>{label}</span>
            </CardContent>
        </Card>
    );
}
