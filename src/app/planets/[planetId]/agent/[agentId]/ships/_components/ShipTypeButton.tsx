'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { getAssetPath } from '@/lib/assetManifest';
import { formatNumberWithUnit } from '@/lib/utils';
import type { ConstructionShipType, PassengerShipType, TransportShipType } from '@/simulation/ships/ships';
import { Clock, Package, Users, Zap } from 'lucide-react';
import Image from 'next/image';
import React from 'react';

export function ShipTypeButton({
    shipType,
    selected,
    onSelect,
}: {
    shipType: TransportShipType | ConstructionShipType | PassengerShipType;
    selected: boolean;
    onSelect: () => void;
}): React.ReactElement {
    return (
        <button
            type='button'
            onClick={onSelect}
            className={`flex flex-col items-center rounded-lg border p-2 gap-2 text-left transition-all hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                selected ? 'border-primary bg-primary/5 ring-2 ring-primary/40' : 'border-border bg-muted/30'
            }`}
        >
            <FacilityOrShipIcon facilityOrShipName={shipType.name} size={80} />
            <span className='flex flex-row items-center gap-1 text-xs font-medium text-center leading-tight'>
                {shipType.name}{' '}
                {shipType.type === 'transport' ? (
                    <Image
                        src={getAssetPath(`form_${shipType.cargoSpecification.type}`)}
                        alt={shipType.cargoSpecification.type}
                        width={10}
                        height={10}
                    />
                ) : null}
            </span>
            <div className='flex flex-wrap gap-1 justify-center'>
                <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                    <Zap className='h-2.5 w-2.5' />
                    {shipType.speed}
                </Badge>
                {shipType.type === 'transport' ? (
                    <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                        <Package className='h-2.5 w-2.5' />
                        {formatNumberWithUnit(shipType.cargoSpecification.volume, 'm3')}
                    </Badge>
                ) : null}
                {shipType.type === 'passenger' ? (
                    <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                        <Users className='h-2.5 w-2.5' />
                        {formatNumberWithUnit(shipType.passengerCapacity, 'persons')}
                    </Badge>
                ) : null}
                <Badge variant='outline' className='text-[10px] px-1 py-0 gap-0.5'>
                    <Clock className='h-2.5 w-2.5' />
                    {shipType.buildingTime}t
                </Badge>
            </div>
        </button>
    );
}
