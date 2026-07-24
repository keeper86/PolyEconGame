'use client';

import { Lock } from 'lucide-react';
import { assetManifest } from '@/lib/assetManifest';
import { CATEGORY_ORDER, getCategoryForLogoKey } from '@/lib/companyLogoCategorization';
import { useState } from 'react';
import { CompanyLogo } from './CompanyLogo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const COMPANY_LOGO_KEYS = (Object.keys(assetManifest) as (keyof typeof assetManifest)[]).filter((k) =>
    k.startsWith('company_icon_'),
);

const LOGOS_BY_CATEGORY = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [
        category,
        COMPANY_LOGO_KEYS.filter((key) => getCategoryForLogoKey(key) === category),
    ]),
) as Record<string, string[]>;

export function CompanyLogoChooser({
    selectedLogo,
    onSelect,
    showPrompt,
    usedLogos = [],
}: {
    selectedLogo: string;
    onSelect: (key: string) => void;
    showPrompt?: boolean;
    usedLogos?: string[];
}) {
    const usedLogosSet = new Set(usedLogos);
    const [open, setOpen] = useState(false);

    return (
        <div className='grid gap-2'>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <button
                        type='button'
                        className={`relative rounded-lg transition-all cursor-pointer ${showPrompt ? 'ring-2 ring-destructive animate-pulse' : ''}`}
                    >
                        <CompanyLogo logoKey={selectedLogo} size={36} className='hover:scale-115' />
                        {showPrompt && (
                            <span className='absolute -top-1.5 -right-1.5 flex h-4 w-4'>
                                <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75' />
                                <span className='relative inline-flex rounded-full h-4 w-4 bg-destructive text-destructive-foreground text-[10px] font-bold items-center justify-center'>
                                    !
                                </span>
                            </span>
                        )}
                    </button>
                </DialogTrigger>
                <DialogContent className='max-w-2xl max-h-[80vh] flex flex-col'>
                    <DialogHeader>
                        <DialogTitle>Choose Company Logo</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue={CATEGORY_ORDER[0]} className='flex flex-col min-h-0 flex-1'>
                        <TabsList className='flex-wrap h-auto'>
                            {CATEGORY_ORDER.map((category) => (
                                <TabsTrigger key={category} value={category} className='text-xs'>
                                    {category}
                                    <span className='ml-1 text-muted-foreground'>
                                        ({LOGOS_BY_CATEGORY[category].length})
                                    </span>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {CATEGORY_ORDER.map((category) => (
                            <TabsContent key={category} value={category} className='overflow-y-auto min-h-0 flex-1'>
                                <div className='grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 p-1'>
                                    {LOGOS_BY_CATEGORY[category].map((key) => {
                                        const isSelected = selectedLogo === key;
                                        const isTaken = usedLogosSet.has(key);
                                        return (
                                            <button
                                                key={key}
                                                type='button'
                                                disabled={isTaken}
                                                title={isTaken ? 'Already taken by another company' : undefined}
                                                onClick={() => {
                                                    if (!isTaken) {
                                                        onSelect(key);
                                                        setOpen(false);
                                                    }
                                                }}
                                                className={`relative flex items-center justify-center p-1.5 rounded-md border transition-all ${
                                                    isTaken
                                                        ? 'border-border opacity-30 cursor-not-allowed'
                                                        : 'hover:bg-accent'
                                                } ${
                                                    isSelected ? 'ring-2 ring-primary border-primary' : 'border-border'
                                                }`}
                                            >
                                                <CompanyLogo logoKey={key} size={42} className='hover:scale-115' />
                                                {isTaken && (
                                                    <span className='absolute inset-0 flex items-center justify-center'>
                                                        <Lock className='w-[32px] h-[32px] text-foreground bg-background/80 rounded-full p-0.5' />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>
                </DialogContent>
            </Dialog>
        </div>
    );
}
