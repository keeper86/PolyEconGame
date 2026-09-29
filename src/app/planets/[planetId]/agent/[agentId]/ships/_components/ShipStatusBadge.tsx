'use client';

import { Badge } from '@/components/ui/badge';
import type { Ship } from '@/simulation/ships/ships';
import { useTranslations } from 'next-intl';
import React from 'react';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
    'idle': 'secondary',
    'listed': 'secondary',
    'derelict': 'destructive',
    'lost': 'destructive',
    'transporting': 'default',
    'passenger_transporting': 'default',
    'construction_transporting': 'default',
    'loading': 'outline',
    'unloading': 'outline',
    'pre-fabrication': 'outline',
    'reconstruction': 'outline',
    'passenger_boarding': 'outline',
    'passenger_provisioning': 'outline',
    'passenger_unloading': 'outline',
};

type StatusLabelKey =
    | 'idle'
    | 'listed'
    | 'derelict'
    | 'lost'
    | 'inTransit'
    | 'loading'
    | 'unloading'
    | 'preFabrication'
    | 'reconstruction'
    | 'boarding'
    | 'provisioning';

const STATUS_LABEL_KEYS: Record<string, StatusLabelKey> = {
    'idle': 'idle',
    'listed': 'listed',
    'derelict': 'derelict',
    'lost': 'lost',
    'transporting': 'inTransit',
    'passenger_transporting': 'inTransit',
    'construction_transporting': 'inTransit',
    'loading': 'loading',
    'unloading': 'unloading',
    'pre-fabrication': 'preFabrication',
    'reconstruction': 'reconstruction',
    'passenger_boarding': 'boarding',
    'passenger_provisioning': 'provisioning',
    'passenger_unloading': 'unloading',
};

export function ShipStatusBadge({ ship }: { ship: Ship }): React.ReactElement {
    const t = useTranslations('Ships.statusLabels');
    const status = ship.state.type;
    const labelKey = STATUS_LABEL_KEYS[status];
    return <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>{labelKey ? t(labelKey) : status}</Badge>;
}
