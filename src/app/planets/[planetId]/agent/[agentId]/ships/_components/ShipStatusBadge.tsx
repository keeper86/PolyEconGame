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

export function ShipStatusBadge({ ship }: { ship: Ship }): React.ReactElement {
    return <Badge variant={STATUS_VARIANTS[ship.state.type] ?? 'secondary'}>{ship.state.type}</Badge>;
}
