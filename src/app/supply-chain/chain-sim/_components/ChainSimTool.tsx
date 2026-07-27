'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
    runChainSimulation,
    DEFAULT_CHAIN_CONFIG,
    PID_DEFAULTS,
    PRICING_DEFAULTS,
    getNodeSeries,
    getOscillationAmplitude,
    type ChainSimConfig,
    type SimSnapshot,
    type PidParams,
    type PricingParams,
    type DemandModel,
    type ChainNodeConfig,
} from './chainSimulator';
import { ScaleChart, InventoryChart, PriceChart, SignalChart } from './ChainChart';

type Mode = 'pid' | 'pricing' | 'demand' | 'scale';

const DEMAND_LABELS: Record<string, string> = {
    constant: 'Constant',
    step: 'Step Change',
    sine: 'Sine Wave',
};

export default function ChainSimTool() {
    const [numTicks, setNumTicks] = useState(3600); // 10 years
    const [nodes] = useState<ChainNodeConfig[]>(DEFAULT_CHAIN_CONFIG);
    const [pid, setPid] = useState<PidParams>(PID_DEFAULTS);
    const [pricing, setPricing] = useState<PricingParams>(PRICING_DEFAULTS);
    const [demand, setDemand] = useState<DemandModel>({ type: 'constant', demandPerTick: 40 });
    const [scaleOverride, setScaleOverride] = useState<Record<string, number>>({
        mine: 1,
        smelter: 1,
        factory: 1,
    });
    const [results, setResults] = useState<SimSnapshot[]>([]);
    const [activeMode, setActiveMode] = useState<Mode>('pid');
    const [runTime, setRunTime] = useState<number | null>(null);

    const handleRun = useCallback(() => {
        const config: ChainSimConfig = {
            nodes,
            pid,
            pricing,
            demand,
            numTicks,
            scaleOverride,
        };
        const start = performance.now();
        const snapshots = runChainSimulation(config);
        const elapsed = performance.now() - start;
        setResults(snapshots);
        setRunTime(elapsed);
    }, [nodes, pid, pricing, demand, numTicks, scaleOverride]);

    const updatePid = useCallback((key: keyof PidParams, value: number) => {
        setPid((prev) => ({ ...prev, [key]: value }));
    }, []);

    const updatePricing = useCallback((key: keyof PricingParams, value: number) => {
        setPricing((prev) => ({ ...prev, [key]: value }));
    }, []);

    // Oscillation analysis
    const oscillationMetrics = useMemo(() => {
        if (results.length < 10) {
            return null;
        }
        const metrics: Record<string, { scaleAmp: number; priceAmp: number }> = {};
        const last1000 = results.slice(-Math.min(results.length, 1000));
        for (const nc of nodes) {
            const scales = getNodeSeries(last1000, nc.id, 'scale');
            const prices = getNodeSeries(last1000, nc.id, 'price');
            metrics[nc.id] = {
                scaleAmp: getOscillationAmplitude(scales),
                priceAmp: getOscillationAmplitude(prices),
            };
        }
        return metrics;
    }, [results, nodes]);

    const finalInventory = useMemo(() => {
        if (results.length === 0) {
            return null;
        }
        const last = results[results.length - 1];
        const inv: Record<string, number> = {};
        for (const nc of nodes) {
            inv[nc.id] = last.nodes[nc.id]?.inventory ?? 0;
        }
        return inv;
    }, [results, nodes]);

    const finalScale = useMemo(() => {
        if (results.length === 0) {
            return null;
        }
        const last = results[results.length - 1];
        const s: Record<string, { scale: number; maxScale: number }> = {};
        for (const nc of nodes) {
            s[nc.id] = { scale: last.nodes[nc.id]?.scale ?? 0, maxScale: nc.maxScale };
        }
        return s;
    }, [results, nodes]);

    return (
        <div className='space-y-4'>
            {/* Mode tabs */}
            <div className='flex border rounded-md overflow-hidden'>
                {(['pid', 'pricing', 'demand', 'scale'] as Mode[]).map((m) => (
                    <button
                        key={m}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                            activeMode === m ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                        }`}
                        onClick={() => setActiveMode(m)}
                    >
                        {m === 'pid'
                            ? 'PID Controller'
                            : m === 'pricing'
                              ? 'Pricing'
                              : m === 'demand'
                                ? 'Demand'
                                : 'Initial Scale'}
                    </button>
                ))}
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                {/* Configuration Panel */}
                <Card className='lg:col-span-1'>
                    <CardHeader className='pb-2 pt-3 px-4'>
                        <CardTitle className='text-sm font-semibold'>Parameters</CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3 space-y-4'>
                        {activeMode === 'pid' && (
                            <>
                                <p className='text-xs text-muted-foreground'>
                                    PID controller gains and limits. Signal ∈ [-1, 1].
                                </p>
                                <div className='border-t pt-3'>
                                    <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
                                        Gains
                                    </p>
                                    <NumericSlider
                                        label='Kp'
                                        value={pid.kp}
                                        min={0}
                                        max={0.2}
                                        step={0.001}
                                        onChange={(v) => updatePid('kp', v)}
                                    />
                                    <NumericSlider
                                        label='Ki'
                                        value={pid.ki}
                                        min={0}
                                        max={0.05}
                                        step={0.0001}
                                        onChange={(v) => updatePid('ki', v)}
                                    />
                                    <NumericSlider
                                        label='Kd'
                                        value={pid.kd}
                                        min={0}
                                        max={0.1}
                                        step={0.001}
                                        onChange={(v) => updatePid('kd', v)}
                                    />
                                </div>
                                <div className='border-t pt-3'>
                                    <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
                                        Limits
                                    </p>
                                    <NumericSlider
                                        label='Integral Max'
                                        value={pid.iMax}
                                        min={0}
                                        max={0.1}
                                        step={0.001}
                                        onChange={(v) => updatePid('iMax', v)}
                                    />
                                    <NumericSlider
                                        label='Output Max (per tick)'
                                        value={pid.outMax}
                                        min={0.001}
                                        max={0.1}
                                        step={0.001}
                                        onChange={(v) => updatePid('outMax', v)}
                                    />
                                    <NumericSlider
                                        label='D Alpha (smoothing)'
                                        value={pid.dAlpha}
                                        min={0.01}
                                        max={1.0}
                                        step={0.01}
                                        onChange={(v) => updatePid('dAlpha', v)}
                                    />
                                </div>
                            </>
                        )}

                        {activeMode === 'pricing' && (
                            <>
                                <p className='text-xs text-muted-foreground'>
                                    Pricing adjusts offer/bid prices based on market conditions.
                                </p>
                                <NumericSlider
                                    label='Price Adjust Max Up'
                                    value={pricing.priceAdjustMaxUp}
                                    min={1.0}
                                    max={2.0}
                                    step={0.01}
                                    onChange={(v) => updatePricing('priceAdjustMaxUp', v)}
                                />
                                <NumericSlider
                                    label='Price Adjust Max Down'
                                    value={pricing.priceAdjustMaxDown}
                                    min={0.5}
                                    max={1.0}
                                    step={0.01}
                                    onChange={(v) => updatePricing('priceAdjustMaxDown', v)}
                                />
                                <NumericSlider
                                    label='Cost Spring Strength'
                                    value={pricing.costSpringStrength}
                                    min={0}
                                    max={1.0}
                                    step={0.01}
                                    onChange={(v) => updatePricing('costSpringStrength', v)}
                                />
                                <NumericSlider
                                    label='Target Sell-Through'
                                    value={pricing.targetSellThrough}
                                    min={0.5}
                                    max={1.0}
                                    step={0.01}
                                    onChange={(v) => updatePricing('targetSellThrough', v)}
                                />
                                <NumericSlider
                                    label='Output Buffer (ticks)'
                                    value={pricing.outputBufferTicks}
                                    min={0}
                                    max={100}
                                    step={1}
                                    onChange={(v) => updatePricing('outputBufferTicks', v)}
                                />
                                <NumericSlider
                                    label='Input Buffer Target (ticks)'
                                    value={pricing.inputBufferTargetTicks}
                                    min={1}
                                    max={100}
                                    step={1}
                                    onChange={(v) => updatePricing('inputBufferTargetTicks', v)}
                                />
                            </>
                        )}

                        {activeMode === 'demand' && (
                            <>
                                <p className='text-xs text-muted-foreground'>
                                    Population demand for the final good (Widgets).
                                </p>
                                <div className='flex flex-wrap gap-1.5 mb-2'>
                                    {(['constant', 'step', 'sine'] as const).map((dm) => (
                                        <button
                                            key={dm}
                                            onClick={() => {
                                                let m: DemandModel;
                                                switch (dm) {
                                                    case 'constant':
                                                        m = { type: 'constant', demandPerTick: 40 };
                                                        break;
                                                    case 'step':
                                                        m = {
                                                            type: 'step',
                                                            initial: 40,
                                                            afterTick: 1800,
                                                            newValue: 10,
                                                        };
                                                        break;
                                                    case 'sine':
                                                        m = { type: 'sine', mean: 40, amplitude: 25, periodTicks: 720 };
                                                        break;
                                                }
                                                setDemand(m);
                                            }}
                                            className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                                                demand.type === dm
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'border-border hover:bg-muted'
                                            }`}
                                        >
                                            {DEMAND_LABELS[dm]}
                                        </button>
                                    ))}
                                </div>
                                {demand.type === 'constant' && (
                                    <NumericSlider
                                        label='Demand/Tick'
                                        value={demand.demandPerTick}
                                        min={0}
                                        max={200}
                                        step={1}
                                        onChange={(v) => setDemand({ ...demand, demandPerTick: v })}
                                    />
                                )}
                                {demand.type === 'step' && (
                                    <>
                                        <NumericSlider
                                            label='Initial Demand'
                                            value={demand.initial}
                                            min={0}
                                            max={200}
                                            step={1}
                                            onChange={(v) => setDemand({ ...demand, initial: v })}
                                        />
                                        <NumericSlider
                                            label='At Tick'
                                            value={demand.afterTick}
                                            min={1}
                                            max={5000}
                                            step={60}
                                            onChange={(v) => setDemand({ ...demand, afterTick: v })}
                                        />
                                        <NumericSlider
                                            label='New Demand'
                                            value={demand.newValue}
                                            min={0}
                                            max={200}
                                            step={1}
                                            onChange={(v) => setDemand({ ...demand, newValue: v })}
                                        />
                                    </>
                                )}
                                {demand.type === 'sine' && (
                                    <>
                                        <NumericSlider
                                            label='Mean Demand'
                                            value={demand.mean}
                                            min={0}
                                            max={200}
                                            step={1}
                                            onChange={(v) => setDemand({ ...demand, mean: v })}
                                        />
                                        <NumericSlider
                                            label='Amplitude'
                                            value={demand.amplitude}
                                            min={0}
                                            max={100}
                                            step={1}
                                            onChange={(v) => setDemand({ ...demand, amplitude: v })}
                                        />
                                        <NumericSlider
                                            label='Period (ticks)'
                                            value={demand.periodTicks}
                                            min={30}
                                            max={3600}
                                            step={30}
                                            onChange={(v) => setDemand({ ...demand, periodTicks: v })}
                                        />
                                    </>
                                )}
                            </>
                        )}

                        {activeMode === 'scale' && (
                            <>
                                <p className='text-xs text-muted-foreground'>
                                    Initial scale multipliers. 1.0 = balanced steady-state. Set {'>'}1 to create a glut,{' '}
                                    {'<'}1 for a shortage shock.
                                </p>
                                {nodes.map((nc) => (
                                    <NumericSlider
                                        key={nc.id}
                                        label={`${nc.name} (base ${nc.initialScale})`}
                                        value={scaleOverride[nc.id] ?? 1}
                                        min={0.1}
                                        max={5}
                                        step={0.1}
                                        onChange={(v) => setScaleOverride((prev) => ({ ...prev, [nc.id]: v }))}
                                    />
                                ))}
                            </>
                        )}

                        {/* Run Controls */}
                        <div className='border-t pt-3 space-y-2'>
                            <div className='flex items-center gap-2'>
                                <Label className='text-xs'>Ticks:</Label>
                                <Input
                                    type='number'
                                    min={1}
                                    max={36000}
                                    value={numTicks}
                                    onChange={(e) => setNumTicks(Math.max(1, Math.min(36000, Number(e.target.value))))}
                                    className='w-16 h-7 text-xs text-right'
                                />
                            </div>
                            <div className='flex gap-2'>
                                <Button
                                    size='sm'
                                    variant='outline'
                                    className='flex-1 text-xs'
                                    onClick={() => setNumTicks(360)}
                                >
                                    1 Year
                                </Button>
                                <Button
                                    size='sm'
                                    variant='outline'
                                    className='flex-1 text-xs'
                                    onClick={() => setNumTicks(3600)}
                                >
                                    10 Years
                                </Button>
                                <Button
                                    size='sm'
                                    variant='outline'
                                    className='flex-1 text-xs'
                                    onClick={() => setNumTicks(36000)}
                                >
                                    100 Years
                                </Button>
                                <Button size='sm' onClick={handleRun} className='flex-1 text-xs'>
                                    Run
                                </Button>
                            </div>
                        </div>
                        {runTime !== null && (
                            <p className='text-[10px] text-muted-foreground text-right'>
                                Computed {results.length} ticks in {runTime.toFixed(1)}ms
                                {' • '}
                                {((results.length / runTime) * 1000).toFixed(0)} ticks/s
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Results */}
                <div className='lg:col-span-2 space-y-4'>
                    {/* Quick stats */}
                    {oscillationMetrics && finalInventory && finalScale && (
                        <Card>
                            <CardHeader className='pb-1 pt-3 px-4'>
                                <CardTitle className='text-sm font-semibold'>Final State & Stability</CardTitle>
                            </CardHeader>
                            <CardContent className='px-4 pb-3'>
                                <div className='grid grid-cols-3 gap-3'>
                                    {nodes.map((nc) => {
                                        const om = oscillationMetrics[nc.id];
                                        const fs = finalScale[nc.id];
                                        const inv = finalInventory[nc.id];
                                        const utilization = fs ? ((fs.scale / fs.maxScale) * 100).toFixed(0) : '0';
                                        return (
                                            <div key={nc.id} className='space-y-1 p-2 bg-muted/50 rounded-md'>
                                                <p className='text-xs font-semibold text-foreground'>{nc.name}</p>
                                                <div className='text-[10px] text-muted-foreground space-y-0.5'>
                                                    <p>
                                                        Scale: {fs?.scale.toFixed(0)} / {fs?.maxScale} ({utilization}%)
                                                    </p>
                                                    <p>Inventory: {inv?.toFixed(0)}</p>
                                                    <p>Scale osc.: {(om.scaleAmp * 100).toFixed(1)}%</p>
                                                    <p>Price osc.: {(om.priceAmp * 100).toFixed(1)}%</p>
                                                </div>
                                                <div className='flex gap-1'>
                                                    <Badge
                                                        variant={om.scaleAmp < 0.05 ? 'default' : 'destructive'}
                                                        className='text-[9px] px-1 py-0'
                                                    >
                                                        {om.scaleAmp < 0.05 ? 'Stable' : 'Oscillating'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Charts */}
                    <Card>
                        <CardHeader className='pb-1 pt-3 px-4'>
                            <CardTitle className='text-sm font-semibold'>Production Scale</CardTitle>
                            <CardDescription className='text-[10px]'>
                                Scale per node over time (max scale shown as upper bound)
                            </CardDescription>
                        </CardHeader>
                        <CardContent className='px-2 pb-2'>
                            <ScaleChart snapshots={results} nodes={nodes} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className='pb-1 pt-3 px-4'>
                            <CardTitle className='text-sm font-semibold'>Inventory</CardTitle>
                            <CardDescription className='text-[10px]'>Output inventory per node</CardDescription>
                        </CardHeader>
                        <CardContent className='px-2 pb-2'>
                            <InventoryChart snapshots={results} nodes={nodes} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className='pb-1 pt-3 px-4'>
                            <CardTitle className='text-sm font-semibold'>Prices</CardTitle>
                            <CardDescription className='text-[10px]'>
                                Offer price and cost floor per node (dashed line)
                            </CardDescription>
                        </CardHeader>
                        <CardContent className='px-2 pb-2'>
                            <PriceChart snapshots={results} nodes={nodes} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className='pb-1 pt-3 px-4'>
                            <CardTitle className='text-sm font-semibold'>PID Signal</CardTitle>
                            <CardDescription className='text-[10px]'>
                                Market signal ∈ [-1, 1] that drives scale changes
                            </CardDescription>
                        </CardHeader>
                        <CardContent className='px-2 pb-2'>
                            <SignalChart snapshots={results} nodes={nodes} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function NumericSlider({
    label,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className='space-y-1'>
            <div className='flex items-center justify-between'>
                <Label className='text-xs text-muted-foreground'>{label}</Label>
                <Input
                    type='number'
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className='w-20 h-6 text-xs text-right'
                />
            </div>
            <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
        </div>
    );
}
