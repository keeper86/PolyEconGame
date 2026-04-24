'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { formatNumbers } from '@/lib/utils';
import { shiptypes, constructionShipType } from '@/simulation/ships/ships';
import type { TransportShipType, ConstructionShipType } from '@/simulation/ships/ships';
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Zap, Package, Clock } from 'lucide-react';

const categoryLabels: Record<keyof typeof shiptypes, string> = {
    solid: 'Bulk Carriers',
    liquid: 'Tankers',
    gas: 'Gas Carriers',
    pieces: 'Freighters',
    frozenGoods: 'Reefer Ships',
    passenger: 'Passenger Ships',
};

const allShipTypesByCategory = Object.entries(shiptypes).map(([key, types]) => ({
    key: key as keyof typeof shiptypes,
    label: categoryLabels[key as keyof typeof shiptypes],
    ships: Object.values(types) as TransportShipType[],
}));

export function ShipSelectionDialog({
    open,
    onOpenChange,
    onConfirm,
    isPending,
    error,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (shipTypeName: string, shipName: string) => void;
    isPending: boolean;
    error?: string | null;
}): React.ReactElement {
    const [selectedShipType, setSelectedShipType] = useState<TransportShipType | ConstructionShipType | null>(null);
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
                            {[constructionShipType].map((shipType) => {
                                const isSelected = selectedShipType?.name === shipType.name;
                                return (
                                    <button
                                        key={shipType.name}
                                        type='button'
                                        onClick={() => setSelectedShipType(shipType)}
                                        className={`flex flex-col items-center rounded-lg border p-2 gap-2 text-left transition-all hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                                            isSelected
                                                ? 'border-primary bg-primary/5 ring-2 ring-primary/40'
                                                : 'border-border bg-muted/30'
                                        }`}
                                    >
                                        <FacilityOrShipIcon facilityOrShipName={shipType.name} size={80} />
                                        <span className='text-xs font-medium text-center leading-tight'>
                                            {shipType.name}
                                        </span>
                                        <div className='flex flex-wrap gap-1 justify-center'>
                                            <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                                                <Zap className='h-2.5 w-2.5' />
                                                {shipType.speed}
                                            </Badge>
                                            <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                                                <Clock className='h-2.5 w-2.5' />
                                                {shipType.buildingTime}t
                                            </Badge>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {allShipTypesByCategory.map(({ key, label, ships }) => (
                        <div key={key}>
                            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2'>
                                {label}
                            </p>
                            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                                {ships.map((shipType) => {
                                    const isSelected = selectedShipType?.name === shipType.name;
                                    return (
                                        <button
                                            key={shipType.name}
                                            type='button'
                                            onClick={() => setSelectedShipType(shipType)}
                                            className={`flex flex-col items-center rounded-lg border p-2 gap-2 text-left transition-all hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                                                isSelected
                                                    ? 'border-primary bg-primary/5 ring-2 ring-primary/40'
                                                    : 'border-border bg-muted/30'
                                            }`}
                                        >
                                            <FacilityOrShipIcon facilityOrShipName={shipType.name} size={80} />
                                            <span className='text-xs font-medium text-center leading-tight'>
                                                {shipType.name}
                                            </span>
                                            <div className='flex flex-wrap gap-1 justify-center'>
                                                <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                                                    <Zap className='h-2.5 w-2.5' />
                                                    {shipType.speed}
                                                </Badge>
                                                <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                                                    <Package className='h-2.5 w-2.5' />
                                                    {formatNumbers(shipType.cargoSpecification.volume / 1000)}k m³
                                                </Badge>
                                                <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                                                    <Clock className='h-2.5 w-2.5' />
                                                    {shipType.buildingTime}t
                                                </Badge>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {selectedShipType && (
                    <div className='border-t pt-4 space-y-3'>
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
                            <Button size='sm' variant='ghost' onClick={() => handleOpenChange(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
