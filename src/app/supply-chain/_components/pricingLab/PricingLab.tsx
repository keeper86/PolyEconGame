'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    runSimulation,
    SELL_DEFAULTS,
    BUY_DEFAULTS,
    PRESET_SCENARIOS,
    type Scenario,
    type SideMode,
    type TickResult,
    type DemandModel,
} from './pricingSimulator';
import PricingChart from './PricingChart';
import TickDiagnosticsTable from './TickDiagnosticsTable';
import PricingDetailPanel from './PricingDetailPanel';

const PRESET_LABELS: Record<string, string> = {
    'sell-stable': 'Stable Market',
    'sell-glut': 'Glut (oversupply)',
    'sell-shortage': 'Shortage (low stock)',
    'sell-cost-pressure': 'Below Cost Floor',
    'sell-demand-shock': 'Demand Collapse',
    'buy-stable': 'Steady Buying',
    'buy-desperate': 'Desperate Buying',
    'buy-demand-spike': 'Demand Spike',
};

const DEMAND_MODEL_LABELS: Record<string, string> = {
    constant: 'Constant',
    elastic: 'Price-Elastic',
    random: 'Random Noise',
    step: 'Step Change',
    sine: 'Sine Wave',
};

export default function PricingLab() {
    // Mode
    const [mode, setMode] = useState<SideMode>('sell');

    // Scenario (derived from mode defaults, modified by UI)
    const [scenario, setScenario] = useState<Scenario>(SELL_DEFAULTS);
    const [numTicks, setNumTicks] = useState(60);
    const [selectedTick, setSelectedTick] = useState<number | null>(null);
    const [results, setResults] = useState<TickResult[]>([]);
    const [lastPreset, setLastPreset] = useState<string | null>(null);

    const updateNumeric = useCallback((key: string, value: number) => {
        setScenario((prev) => {
            if (key in prev) {
                return { ...prev, [key]: value } as Scenario;
            }
            return prev;
        });
    }, []);

    // Apply a preset
    const applyPreset = useCallback((presetName: string) => {
        const preset = PRESET_SCENARIOS[presetName];
        if (preset) {
            setScenario(preset);
            setMode(preset.mode);
            setLastPreset(presetName);
            setResults([]);
            setSelectedTick(null);
        }
    }, []);

    // Run simulation
    const handleRun = useCallback(() => {
        const r = runSimulation(scenario, numTicks);
        setResults(r);
        setSelectedTick(r.length > 0 ? r[r.length - 1].tick : null);
    }, [scenario, numTicks]);

    // Selected tick result
    const selectedResult = useMemo(() => results.find((r) => r.tick === selectedTick) ?? null, [results, selectedTick]);

    const isSell = mode === 'sell';

    return (
        <div className='space-y-4'>
            {/* Mode and Presets */}
            <div className='flex flex-wrap items-center gap-2'>
                <div className='flex border rounded-md overflow-hidden'>
                    <button
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                            mode === 'sell' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                        }`}
                        onClick={() => {
                            setMode('sell');
                            setScenario(SELL_DEFAULTS);
                            setResults([]);
                            setSelectedTick(null);
                            setLastPreset(null);
                        }}
                    >
                        Sell-Side
                    </button>
                    <button
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                            mode === 'buy' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                        }`}
                        onClick={() => {
                            setMode('buy');
                            setScenario(BUY_DEFAULTS);
                            setResults([]);
                            setSelectedTick(null);
                            setLastPreset(null);
                        }}
                    >
                        Buy-Side
                    </button>
                </div>

                <span className='text-xs text-muted-foreground'>Presets:</span>
                <div className='flex flex-wrap gap-1.5'>
                    {Object.entries(PRESET_SCENARIOS)
                        .filter(([k]) => k.startsWith(mode))
                        .map(([k]) => (
                            <button
                                key={k}
                                onClick={() => applyPreset(k)}
                                className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                                    lastPreset === k
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'border-border hover:bg-muted'
                                }`}
                            >
                                {PRESET_LABELS[k] ?? k}
                            </button>
                        ))}
                </div>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                {/* Configuration Panel */}
                <Card className='lg:col-span-1'>
                    <CardHeader className='pb-2 pt-3 px-4'>
                        <CardTitle className='text-sm font-semibold'>Scenario Parameters</CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3 space-y-4'>
                        {/* Initial Price */}
                        <NumericSlider
                            label='Initial Price'
                            value={scenario.initialPrice}
                            min={0.01}
                            max={10000}
                            step={1}
                            onChange={(v) => updateNumeric('initialPrice', v)}
                        />

                        {/* Market Price */}
                        <NumericSlider
                            label='Market Price'
                            value={scenario.marketPrice}
                            min={0.01}
                            max={10000}
                            step={1}
                            onChange={(v) => updateNumeric('marketPrice', v)}
                        />

                        {/* Cost Floor */}
                        <NumericSlider
                            label='Cost Floor'
                            value={scenario.costFloor}
                            min={0.01}
                            max={10000}
                            step={1}
                            onChange={(v) => updateNumeric('costFloor', v)}
                        />

                        {isSell ? (
                            <>
                                <NumericSlider
                                    label='Inventory'
                                    value={(scenario as typeof SELL_DEFAULTS).inventory}
                                    min={0}
                                    max={50000}
                                    step={100}
                                    onChange={(v) => updateNumeric('inventory', v)}
                                />
                                <NumericSlider
                                    label='Production Rate (baseRate)'
                                    value={(scenario as typeof SELL_DEFAULTS).baseRate}
                                    min={0}
                                    max={1000}
                                    step={5}
                                    onChange={(v) => updateNumeric('baseRate', v)}
                                />
                                <NumericSlider
                                    label='Last Sold'
                                    value={(scenario as typeof SELL_DEFAULTS).lastSold}
                                    min={0}
                                    max={1000}
                                    step={1}
                                    onChange={(v) => updateNumeric('lastSold', v)}
                                />
                            </>
                        ) : (
                            <>
                                <NumericSlider
                                    label='Shortfall'
                                    value={(scenario as typeof BUY_DEFAULTS).shortfall}
                                    min={0}
                                    max={10000}
                                    step={50}
                                    onChange={(v) => updateNumeric('shortfall', v)}
                                />
                                <NumericSlider
                                    label='Storage Target'
                                    value={(scenario as typeof BUY_DEFAULTS).storageTarget}
                                    min={0}
                                    max={50000}
                                    step={100}
                                    onChange={(v) => updateNumeric('storageTarget', v)}
                                />
                                <NumericSlider
                                    label='Last Bought'
                                    value={(scenario as typeof BUY_DEFAULTS).lastBought}
                                    min={0}
                                    max={1000}
                                    step={1}
                                    onChange={(v) => updateNumeric('lastBought', v)}
                                />
                                <NumericSlider
                                    label='Last Demanded'
                                    value={(scenario as typeof BUY_DEFAULTS).lastDemanded}
                                    min={0}
                                    max={1000}
                                    step={1}
                                    onChange={(v) => updateNumeric('lastDemanded', v)}
                                />
                            </>
                        )}

                        {/* ── Pricing Config ── */}
                        <div className='border-t pt-3'>
                            <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
                                Pricing Config
                            </p>
                            <NumericSlider
                                label='Price Adjust Max Up'
                                value={scenario.priceAdjustMaxUp}
                                min={1.0}
                                max={2.0}
                                step={0.01}
                                onChange={(v) => updateNumeric('priceAdjustMaxUp', v)}
                            />
                            <NumericSlider
                                label='Price Adjust Max Down'
                                value={scenario.priceAdjustMaxDown}
                                min={0.5}
                                max={1.0}
                                step={0.01}
                                onChange={(v) => updateNumeric('priceAdjustMaxDown', v)}
                            />
                            <NumericSlider
                                label='Cost Spring Strength'
                                value={scenario.costSpringStrength}
                                min={0}
                                max={1.0}
                                step={0.01}
                                onChange={(v) => updateNumeric('costSpringStrength', v)}
                            />
                            {isSell && (
                                <>
                                    <NumericSlider
                                        label='Target Sell-Through'
                                        value={(scenario as typeof SELL_DEFAULTS).targetSellThrough}
                                        min={0.5}
                                        max={1.0}
                                        step={0.01}
                                        onChange={(v) => updateNumeric('targetSellThrough', v)}
                                    />
                                    <NumericSlider
                                        label='Output Buffer (ticks)'
                                        value={(scenario as typeof SELL_DEFAULTS).outputBufferMaxTicks}
                                        min={1}
                                        max={100}
                                        step={1}
                                        onChange={(v) => updateNumeric('outputBufferMaxTicks', v)}
                                    />
                                    <NumericSlider
                                        label='Cost Floor Buffer'
                                        value={(scenario as typeof SELL_DEFAULTS).automatedCostFloorBuffer}
                                        min={1.0}
                                        max={5.0}
                                        step={0.1}
                                        onChange={(v) => updateNumeric('automatedCostFloorBuffer', v)}
                                    />
                                </>
                            )}
                            {!isSell && (
                                <>
                                    <NumericSlider
                                        label='Target Fill Rate'
                                        value={(scenario as typeof BUY_DEFAULTS).targetFillRate}
                                        min={0.5}
                                        max={1.0}
                                        step={0.01}
                                        onChange={(v) => updateNumeric('targetFillRate', v)}
                                    />
                                    <NumericSlider
                                        label='Input Buffer (ticks)'
                                        value={(scenario as typeof BUY_DEFAULTS).inputBufferTargetTicks}
                                        min={1}
                                        max={100}
                                        step={1}
                                        onChange={(v) => updateNumeric('inputBufferTargetTicks', v)}
                                    />
                                </>
                            )}
                            <NumericSlider
                                label='Inventory Smoothing'
                                value={scenario.inventorySmoothingMaxExtra}
                                min={0}
                                max={10}
                                step={0.5}
                                onChange={(v) => updateNumeric('inventorySmoothingMaxExtra', v)}
                            />
                            <NumericSlider
                                label='Max Cost Multiplier'
                                value={scenario.bidOfferMaxCostMultiplier}
                                min={1}
                                max={20}
                                step={1}
                                onChange={(v) => updateNumeric('bidOfferMaxCostMultiplier', v)}
                            />
                        </div>

                        {/* ── Demand Model ── */}
                        <div className='border-t pt-3'>
                            <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
                                Demand Model
                            </p>
                            <div className='flex flex-wrap gap-1.5 mb-2'>
                                {(['constant', 'elastic', 'random', 'step', 'sine'] as const).map((dm) => {
                                    const current = scenario.demandModel.type;
                                    return (
                                        <button
                                            key={dm}
                                            onClick={() => {
                                                let newModel: DemandModel;
                                                switch (dm) {
                                                    case 'constant':
                                                        newModel = { type: 'constant', soldPerTick: 45 };
                                                        break;
                                                    case 'elastic':
                                                        newModel = {
                                                            type: 'elastic',
                                                            baseDemand: 45,
                                                            elasticity: 0.5,
                                                            noiseStd: 2,
                                                        };
                                                        break;
                                                    case 'random':
                                                        newModel = { type: 'random', mean: 45, std: 10 };
                                                        break;
                                                    case 'step':
                                                        newModel = {
                                                            type: 'step',
                                                            initial: 45,
                                                            afterTick: 30,
                                                            newValue: 10,
                                                        };
                                                        break;
                                                    case 'sine':
                                                        newModel = {
                                                            type: 'sine',
                                                            mean: 45,
                                                            amplitude: 20,
                                                            periodTicks: 30,
                                                        };
                                                        break;
                                                }
                                                setScenario((prev) => ({
                                                    ...prev,
                                                    demandModel: newModel,
                                                }));
                                            }}
                                            className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                                                current === dm
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'border-border hover:bg-muted'
                                            }`}
                                        >
                                            {DEMAND_MODEL_LABELS[dm]}
                                        </button>
                                    );
                                })}
                            </div>
                            <ShorthandParamEditor
                                model={scenario.demandModel}
                                onChange={(m) => setScenario((prev) => ({ ...prev, demandModel: m }))}
                            />
                        </div>

                        {/* ── Run Controls ── */}
                        <div className='border-t pt-3 flex items-center gap-3'>
                            <div className='flex items-center gap-2'>
                                <Label className='text-xs'>Ticks:</Label>
                                <Input
                                    type='number'
                                    min={1}
                                    max={500}
                                    value={numTicks}
                                    onChange={(e) => setNumTicks(Math.max(1, Math.min(500, Number(e.target.value))))}
                                    className='w-16 h-7 text-xs text-right'
                                />
                            </div>
                            <Button size='sm' onClick={handleRun} className='flex-1'>
                                Run Simulation
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Results Panel */}
                <div className='lg:col-span-2 space-y-4'>
                    {/* Chart */}
                    <Card>
                        <CardHeader className='pb-1 pt-3 px-4'>
                            <CardTitle className='text-sm font-semibold'>
                                Price Trajectory
                                {results.length > 0 && (
                                    <Badge variant='outline' className='ml-2 text-[10px]'>
                                        {results.length} ticks
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className='px-2 pb-2'>
                            <PricingChart
                                results={results}
                                costFloor={scenario.costFloor}
                                marketPrice={scenario.marketPrice}
                                onSelectTick={setSelectedTick}
                            />
                        </CardContent>
                    </Card>

                    {/* Diagnostics Table */}
                    <TickDiagnosticsTable
                        results={results}
                        selectedTick={selectedTick}
                        onSelectTick={setSelectedTick}
                    />

                    {/* Selected tick detail */}
                    {selectedResult && <PricingDetailPanel tickResult={selectedResult} />}
                </div>
            </div>
        </div>
    );
}

// ── Reusable slider input with label ──────────────────────────────────────────

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

// ── Demand model param editor ─────────────────────────────────────────────────

function ShorthandParamEditor({ model, onChange }: { model: DemandModel; onChange: (m: DemandModel) => void }) {
    switch (model.type) {
        case 'constant':
            return (
                <NumericSlider
                    label='Sold/Tick'
                    value={model.soldPerTick}
                    min={0}
                    max={500}
                    step={1}
                    onChange={(v) => onChange({ ...model, soldPerTick: v })}
                />
            );
        case 'elastic':
            return (
                <div className='space-y-1'>
                    <NumericSlider
                        label='Base Demand'
                        value={model.baseDemand}
                        min={0}
                        max={500}
                        step={1}
                        onChange={(v) => onChange({ ...model, baseDemand: v })}
                    />
                    <NumericSlider
                        label='Elasticity'
                        value={model.elasticity}
                        min={0}
                        max={3}
                        step={0.1}
                        onChange={(v) => onChange({ ...model, elasticity: v })}
                    />
                    <NumericSlider
                        label='Noise Std'
                        value={model.noiseStd}
                        min={0}
                        max={50}
                        step={1}
                        onChange={(v) => onChange({ ...model, noiseStd: v })}
                    />
                </div>
            );
        case 'random':
            return (
                <div className='space-y-1'>
                    <NumericSlider
                        label='Mean'
                        value={model.mean}
                        min={0}
                        max={500}
                        step={1}
                        onChange={(v) => onChange({ ...model, mean: v })}
                    />
                    <NumericSlider
                        label='Std Dev'
                        value={model.std}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(v) => onChange({ ...model, std: v })}
                    />
                </div>
            );
        case 'step':
            return (
                <div className='space-y-1'>
                    <NumericSlider
                        label='Initial Demand'
                        value={model.initial}
                        min={0}
                        max={500}
                        step={1}
                        onChange={(v) => onChange({ ...model, initial: v })}
                    />
                    <NumericSlider
                        label='Change at Tick'
                        value={model.afterTick}
                        min={1}
                        max={500}
                        step={1}
                        onChange={(v) => onChange({ ...model, afterTick: v })}
                    />
                    <NumericSlider
                        label='New Demand'
                        value={model.newValue}
                        min={0}
                        max={500}
                        step={1}
                        onChange={(v) => onChange({ ...model, newValue: v })}
                    />
                </div>
            );
        case 'sine':
            return (
                <div className='space-y-1'>
                    <NumericSlider
                        label='Mean'
                        value={model.mean}
                        min={0}
                        max={500}
                        step={1}
                        onChange={(v) => onChange({ ...model, mean: v })}
                    />
                    <NumericSlider
                        label='Amplitude'
                        value={model.amplitude}
                        min={0}
                        max={250}
                        step={1}
                        onChange={(v) => onChange({ ...model, amplitude: v })}
                    />
                    <NumericSlider
                        label='Period (ticks)'
                        value={model.periodTicks}
                        min={5}
                        max={200}
                        step={5}
                        onChange={(v) => onChange({ ...model, periodTicks: v })}
                    />
                </div>
            );
    }
}
