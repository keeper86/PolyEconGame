'use client';

import { Badge } from '@/components/ui/badge';
import type { Ship } from '@/simulation/ships/ships';
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

const STATUS_LABELS: Record<string, string> = {
    'idle': 'Idle',
    'listed': 'Listed for sale',
    'derelict': 'Derelict',
    'lost': 'Lost',
    'transporting': 'In transit',
    'passenger_transporting': 'In transit',
    'construction_transporting': 'In transit',
    'loading': 'Loading',
    'unloading': 'Unloading',
    'pre-fabrication': 'Pre-fabrication',
    'reconstruction': 'Reconstruction',
    'passenger_boarding': 'Boarding',
    'passenger_provisioning': 'Provisioning',
    'passenger_unloading': 'Unloading',
};

export function ShipStatusBadge({ ship }: { ship: Ship }): React.ReactElement {
    const status = ship.state.type;
    return <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>{STATUS_LABELS[status] ?? status}</Badge>;
}
