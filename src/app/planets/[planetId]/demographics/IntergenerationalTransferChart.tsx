'use client';

import type { PopulationTransferMatrix } from '@/simulation/population/population';
import React from 'react';
import type { GroupMode } from './demographicsTypes';
import TransferChart from './TransferChart';

type Props = {
    lastTransferMatrix: PopulationTransferMatrix;
    group: GroupMode;
};

export default function IntergenerationalTransferChart({ lastTransferMatrix, group }: Props): React.ReactElement {
    return <TransferChart title='Intergenerational transfers' matrix={lastTransferMatrix} viewMode={group} />;
}
