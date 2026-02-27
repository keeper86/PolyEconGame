'use client';

import { usePlanetData } from '@/hooks/usePlanetData';
import TickDisplay from '@/components/client/TickDisplay';

/** Client wrapper that fetches the current tick from the simulation and displays it. */
export default function TickDisplayConnected() {
    const { tick } = usePlanetData();
    return <TickDisplay tick={tick} />;
}
