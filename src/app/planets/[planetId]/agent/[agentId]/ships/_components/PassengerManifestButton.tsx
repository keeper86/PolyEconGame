'use client';

import { Button } from '@/components/ui/button';
import type { PassengerManifest } from '@/simulation/ships/manifest';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PassengerManifestDialog } from './PassengerManifestDialog';

export function PassengerManifestButton({
    manifest,
    toPlanetName,
    phase,
}: {
    manifest: PassengerManifest;
    toPlanetName: string;
    phase: string;
}): React.ReactElement {
    const t = useTranslations('Ships');
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button size='sm' variant='ghost' className='h-6 px-2 text-xs ml-auto' onClick={() => setOpen(true)}>
                {t('status.viewManifest')}
            </Button>
            <PassengerManifestDialog
                open={open}
                onOpenChange={setOpen}
                manifest={manifest}
                toPlanetName={toPlanetName}
                phase={phase}
            />
        </>
    );
}
