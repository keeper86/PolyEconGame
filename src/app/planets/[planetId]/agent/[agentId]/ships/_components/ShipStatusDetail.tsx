'use client';

import { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { ProductIcon } from '@/components/client/ProductIcon';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import type { TransportShip, ConstructionShip, PassengerShip } from '@/simulation/ships/ships';
import { PassengerManifestDialog } from './PassengerManifestDialog';

type PlanetSummary = { planetId: string; name: string };

type Props = {
    ship: TransportShip | ConstructionShip | PassengerShip;
    planetSummaries: PlanetSummary[];
    tick: number;
};

function planetName(planetSummaries: PlanetSummary[], id: string): string {
    return planetSummaries.find((p) => p.planetId === id)?.name ?? id;
}

export function ShipStatusDetail({ ship, planetSummaries, tick }: Props) {
    const [manifestOpen, setManifestOpen] = useState(false);
    // Transport ship states
    if (ship.type.type === 'transport') {
        const ts = ship as TransportShip;
        const s = ts.state;

        if (s.type === 'loading') {
            return (
                <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                    {s.cargoGoal ? (
                        <>
                            <ProductIcon productName={s.cargoGoal.resource.name} size={18} />
                            <span>
                                Loading{' '}
                                <span className='tabular-nums text-foreground'>
                                    {s.currentCargo.quantity.toLocaleString()}
                                </span>
                                {' / '}
                                <span className='tabular-nums'>{s.cargoGoal.quantity.toLocaleString()}</span>{' '}
                                {s.cargoGoal.resource.name}
                            </span>
                        </>
                    ) : (
                        <span>Repositioning (empty)</span>
                    )}
                    <ArrowRight className='h-3 w-3' />
                    <span>{planetName(planetSummaries, s.to)}</span>
                </div>
            );
        }

        if (s.type === 'transporting') {
            const eta = s.arrivalTick - tick;
            return (
                <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                    {s.cargo ? (
                        <>
                            <ProductIcon productName={s.cargo.resource.name} size={18} />
                            <span>
                                <span className='tabular-nums text-foreground'>
                                    {s.cargo.quantity.toLocaleString()}
                                </span>{' '}
                                {s.cargo.resource.name}
                            </span>
                        </>
                    ) : (
                        <span>Empty</span>
                    )}
                    <ArrowRight className='h-3 w-3' />
                    <span>{planetName(planetSummaries, s.to)}</span>
                    <span className='text-muted-foreground/70'>
                        ETA{' '}
                        <span className='tabular-nums text-foreground'>
                            {eta > 0 ? `${eta} tick${eta === 1 ? '' : 's'}` : 'arriving'}
                        </span>
                    </span>
                </div>
            );
        }

        if (s.type === 'unloading') {
            return (
                <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                    <ProductIcon productName={s.cargo.resource.name} size={18} />
                    <span>
                        Unloading{' '}
                        <span className='tabular-nums text-foreground'>{s.cargo.quantity.toLocaleString()}</span>{' '}
                        {s.cargo.resource.name}
                    </span>
                </div>
            );
        }

        return null;
    }

    // Construction ship states
    if (ship.type.type === 'construction') {
        const cs = ship as ConstructionShip;
        const s = cs.state;

        if (s.type === 'pre-fabrication') {
            const pct = s.progress * 100;
            return (
                <div className='space-y-1.5'>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                        {s.buildingTarget ? (
                            <>
                                <FacilityOrShipIcon facilityOrShipName={s.buildingTarget.name} size={18} />
                                <span className='text-foreground'>{s.buildingTarget.name}</span>
                            </>
                        ) : (
                            <span>Repositioning</span>
                        )}
                        <ArrowRight className='h-3 w-3' />
                        <span>{planetName(planetSummaries, s.to)}</span>
                    </div>
                    {s.buildingTarget && (
                        <div>
                            <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                                <span>Prefabrication</span>
                                <span className='tabular-nums font-medium text-foreground'>{pct.toFixed(1)}%</span>
                            </div>
                            <Progress
                                value={pct}
                                className='h-1.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500'
                            />
                        </div>
                    )}
                </div>
            );
        }

        if (s.type === 'construction_transporting') {
            const eta = s.arrivalTick - tick;
            return (
                <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                    {s.buildingTarget ? (
                        <>
                            <FacilityOrShipIcon facilityOrShipName={s.buildingTarget.name} size={18} />
                            <span className='text-foreground'>{s.buildingTarget.name}</span>
                        </>
                    ) : (
                        <span>Empty</span>
                    )}
                    <ArrowRight className='h-3 w-3' />
                    <span>{planetName(planetSummaries, s.to)}</span>
                    <span className='text-muted-foreground/70'>
                        ETA{' '}
                        <span className='tabular-nums text-foreground'>
                            {eta > 0 ? `${eta} tick${eta === 1 ? '' : 's'}` : 'arriving'}
                        </span>
                    </span>
                </div>
            );
        }

        if (s.type === 'reconstruction') {
            const pct = (1 - s.progress) * 100;
            return (
                <div className='space-y-1.5'>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                        <FacilityOrShipIcon facilityOrShipName={s.buildingTarget.name} size={18} />
                        <span className='text-foreground'>{s.buildingTarget.name}</span>
                    </div>
                    <div>
                        <div className='flex justify-between text-xs text-muted-foreground mb-1'>
                            <span>Reconstruction</span>
                            <span className='tabular-nums font-medium text-foreground'>{pct.toFixed(1)}%</span>
                        </div>
                        <Progress
                            value={pct}
                            className='h-1.5 bg-amber-100 dark:bg-amber-950/40 [&>div]:bg-amber-500'
                        />
                    </div>
                </div>
            );
        }

        return null;
    }

    // Passenger ship states
    if (ship.type.type === 'passenger') {
        const ps = ship as PassengerShip;
        const s = ps.state;

        if (s.type === 'passenger_boarding') {
            const pct = s.passengerGoal > 0 ? (s.currentPassengers / s.passengerGoal) * 100 : 0;
            return (
                <>
                    <div className='space-y-1.5'>
                        <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                            <span>
                                Boarding:{' '}
                                <span className='tabular-nums text-foreground'>
                                    {s.currentPassengers.toLocaleString()}
                                </span>
                                {' / '}
                                <span className='tabular-nums'>{s.passengerGoal.toLocaleString()}</span> passengers
                            </span>
                            <ArrowRight className='h-3 w-3' />
                            <span>{planetName(planetSummaries, s.toPlanetId)}</span>
                            <Button
                                size='sm'
                                variant='ghost'
                                className='h-6 px-2 text-xs ml-auto'
                                onClick={() => setManifestOpen(true)}
                            >
                                View Manifest
                            </Button>
                        </div>
                        <Progress value={pct} className='h-1.5' />
                    </div>
                    <PassengerManifestDialog
                        open={manifestOpen}
                        onOpenChange={setManifestOpen}
                        manifest={s.manifest}
                        toPlanetName={planetName(planetSummaries, s.toPlanetId)}
                        phase={s.type}
                    />
                </>
            );
        }

        if (s.type === 'passenger_provisioning') {
            const total = Object.values(s.manifest).reduce((sum, cat) => sum + cat.total, 0);
            return (
                <>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                        <span>
                            Provisioning <span className='tabular-nums text-foreground'>{total.toLocaleString()}</span>{' '}
                            passengers
                        </span>
                        <ArrowRight className='h-3 w-3' />
                        <span>{planetName(planetSummaries, s.toPlanetId)}</span>
                        <Button
                            size='sm'
                            variant='ghost'
                            className='h-6 px-2 text-xs ml-auto'
                            onClick={() => setManifestOpen(true)}
                        >
                            View Manifest
                        </Button>
                    </div>
                    <PassengerManifestDialog
                        open={manifestOpen}
                        onOpenChange={setManifestOpen}
                        manifest={s.manifest}
                        toPlanetName={planetName(planetSummaries, s.toPlanetId)}
                        phase={s.type}
                    />
                </>
            );
        }

        if (s.type === 'passenger_transporting') {
            const total = Object.values(s.manifest).reduce((sum, cat) => sum + cat.total, 0);
            const eta = s.arrivalTick - tick;
            return (
                <>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                        <span>
                            <span className='tabular-nums text-foreground'>{total.toLocaleString()}</span> passengers
                        </span>
                        <ArrowRight className='h-3 w-3' />
                        <span>{planetName(planetSummaries, s.to)}</span>
                        <span className='text-muted-foreground/70'>
                            ETA{' '}
                            <span className='tabular-nums text-foreground'>
                                {eta > 0 ? `${eta} tick${eta === 1 ? '' : 's'}` : 'arriving'}
                            </span>
                        </span>
                        <Button
                            size='sm'
                            variant='ghost'
                            className='h-6 px-2 text-xs ml-auto'
                            onClick={() => setManifestOpen(true)}
                        >
                            View Manifest
                        </Button>
                    </div>
                    <PassengerManifestDialog
                        open={manifestOpen}
                        onOpenChange={setManifestOpen}
                        manifest={s.manifest}
                        toPlanetName={planetName(planetSummaries, s.to)}
                        phase={s.type}
                    />
                </>
            );
        }

        if (s.type === 'passenger_unloading') {
            const total = Object.values(s.manifest).reduce((sum, cat) => sum + cat.total, 0);
            return (
                <>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground flex-wrap'>
                        <span>
                            Unloading <span className='tabular-nums text-foreground'>{total.toLocaleString()}</span>{' '}
                            passengers
                        </span>
                        <Button
                            size='sm'
                            variant='ghost'
                            className='h-6 px-2 text-xs ml-auto'
                            onClick={() => setManifestOpen(true)}
                        >
                            View Manifest
                        </Button>
                    </div>
                    <PassengerManifestDialog
                        open={manifestOpen}
                        onOpenChange={setManifestOpen}
                        manifest={s.manifest}
                        toPlanetName={planetName(planetSummaries, s.planetId)}
                        phase={s.type}
                    />
                </>
            );
        }

        return null;
    }

    return null;
}
