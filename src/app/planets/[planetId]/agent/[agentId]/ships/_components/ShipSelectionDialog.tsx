'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { constructionShipType, shiptypes } from '@/simulation/ships/ships';
import type { ConstructionShipType, PassengerShipType, TransportShipType } from '@/simulation/ships/ships';
import React, { useState } from 'react';
import { ShipBuildPlanPanel } from './ShipBuildPlanPanel';
import { ShipTypeButton } from './ShipTypeButton';

const categoryLabels: Record<keyof typeof shiptypes, string> = {
    solid: 'Bulk Carriers',
    liquid: 'Tankers',
    pieces: 'Freighters',
    passenger: 'Passenger Ships',
};

const allShipTypesByCategory = Object.entries(shiptypes).map(([key, types]) => ({
    key: key as keyof typeof shiptypes,
    label: categoryLabels[key as keyof typeof shiptypes],
    ships: Object.values(types) as (TransportShipType | PassengerShipType)[],
}));

type SelectableShipType = TransportShipType | ConstructionShipType | PassengerShipType;

export function ShipSelectionDialog({
    open,
    onOpenChange,
    onConfirm,
    agentId,
    planetId,
    isPending,
    error,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (shipTypeName: string, shipName: string) => void;
    agentId: string;
    planetId: string;
    isPending: boolean;
    error?: string | null;
}): React.ReactElement {
    const [selectedShipType, setSelectedShipType] = useState<SelectableShipType | null>(null);
    const [shipName, setShipName] = useState('');

    const handleConfirm = () => {
        if (!selectedShipType || !shipName.trim()) {
            return;
        }
        onConfirm(selectedShipType.name, shipName.trim());
    };

    const handleOpenChange = (val: boolean) => {
        if (!val) {
            setSelectedShipType(null);
            setShipName('');
        }
        onOpenChange(val);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className='max-w-2xl max-h-[85vh] flex flex-col'>
                <DialogHeader>
                    <DialogTitle>Choose Ship Type</DialogTitle>
                </DialogHeader>

                <div className='flex-1 overflow-y-auto space-y-4 pr-1'>
                    <div>
                        <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2'>
                            Construction Ships
                        </p>
                        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                            <ShipTypeButton
                                shipType={constructionShipType}
                                selected={selectedShipType?.name === constructionShipType.name}
                                onSelect={() => setSelectedShipType(constructionShipType)}
                            />
                        </div>
                    </div>
                    {allShipTypesByCategory.map(({ key, label, ships }) => (
                        <div key={key}>
                            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2'>
                                {label}
                            </p>
                            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                                {ships.map((shipType) => (
                                    <ShipTypeButton
                                        key={shipType.name}
                                        shipType={shipType}
                                        selected={selectedShipType?.name === shipType.name}
                                        onSelect={() => setSelectedShipType(shipType)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {selectedShipType && (
                    <div className='border-t pt-4 space-y-3'>
                        <ShipBuildPlanPanel shipType={selectedShipType} planetId={planetId} agentId={agentId} />
                        <div className='space-y-1'>
                            <Label className='text-xs'>Ship name</Label>
                            <Input
                                className='h-8 text-sm'
                                placeholder='Enter a unique name for this ship'
                                value={shipName}
                                maxLength={50}
                                onChange={(e) => setShipName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleConfirm();
                                    }
                                }}
                                autoFocus
                            />
                        </div>
                        {error && <p className='text-destructive text-xs'>{error}</p>}
                        <div className='flex gap-2'>
                            <Button size='sm' disabled={!shipName.trim() || isPending} onClick={handleConfirm}>
                                {isPending ? 'Starting…' : `Build ${selectedShipType.name}`}
                            </Button>
                            <Button size='sm' variant='destructive' onClick={() => handleOpenChange(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
