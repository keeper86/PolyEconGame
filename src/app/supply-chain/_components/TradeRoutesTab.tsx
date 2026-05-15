'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ARBITRAGE_MIN_PROFIT_PER_TICK } from '@/simulation/constants';
import type { ArbitrageRouteRow } from '@/server/controller/simulation';

// ─── Ship type catalogue (mirrors shiptypes in ships.ts, transport only) ─────

const SHIP_TYPE_OPTIONS: { name: string; label: string; group: string }[] = [
    { name: 'Bulk Carrier 1', label: 'Bulk Carrier 1 (small)', group: 'Solid' },
    { name: 'Bulk Carrier 2', label: 'Bulk Carrier 2 (medium)', group: 'Solid' },
    { name: 'Bulk Carrier 3', label: 'Bulk Carrier 3 (large)', group: 'Solid' },
    { name: 'Bulk Carrier 4', label: 'Bulk Carrier 4 (super)', group: 'Solid' },
    { name: 'Tanker 1', label: 'Tanker 1 (small)', group: 'Liquid' },
    { name: 'Tanker 2', label: 'Tanker 2 (medium)', group: 'Liquid' },
    { name: 'Tanker 3', label: 'Tanker 3 (large)', group: 'Liquid' },
    { name: 'Tanker 4', label: 'Tanker 4 (super)', group: 'Liquid' },
    { name: 'Gas Carrier 1', label: 'Gas Carrier 1 (small)', group: 'Gas' },
    { name: 'Gas Carrier 2', label: 'Gas Carrier 2 (medium)', group: 'Gas' },
    { name: 'Gas Carrier 3', label: 'Gas Carrier 3 (large)', group: 'Gas' },
    { name: 'Gas Carrier 4', label: 'Gas Carrier 4 (super)', group: 'Gas' },
    { name: 'Freighter 1', label: 'Freighter 1 (small)', group: 'Pieces' },
    { name: 'Freighter 2', label: 'Freighter 2 (medium)', group: 'Pieces' },
    { name: 'Freighter 3', label: 'Freighter 3 (large)', group: 'Pieces' },
    { name: 'Freighter 4', label: 'Freighter 4 (super)', group: 'Pieces' },
];

const SHIP_TYPE_GROUPS = ['Solid', 'Liquid', 'Gas', 'Pieces'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string {
    if (Math.abs(n) >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(decimals)}M`;
    }
    if (Math.abs(n) >= 1_000) {
        return `${(n / 1_000).toFixed(decimals)}k`;
    }
    return n.toFixed(decimals);
}

function profitClass(v: number): string {
    if (v >= ARBITRAGE_MIN_PROFIT_PER_TICK) {
        return 'text-green-600 font-semibold';
    }
    if (v >= 0) {
        return 'text-amber-600';
    }
    return 'text-red-500';
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

type SortKey = 'resource' | 'origin' | 'dest' | 'qty' | 'buyPrice' | 'sellAdj' | 'gross' | 'depr' | 'net' | 'ticks';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
    if (col !== sortKey) {
        return <ArrowUpDown className='inline ml-1 h-3 w-3 opacity-40' />;
    }
    return dir === 'asc' ? <ArrowUp className='inline ml-1 h-3 w-3' /> : <ArrowDown className='inline ml-1 h-3 w-3' />;
}

function sortRoutes(rows: ArbitrageRouteRow[], key: SortKey, dir: SortDir): ArbitrageRouteRow[] {
    const sorted = [...rows].sort((a, b) => {
        switch (key) {
            case 'resource':
                return a.resourceName.localeCompare(b.resourceName);
            case 'origin':
                return a.originPlanetName.localeCompare(b.originPlanetName);
            case 'dest':
                return a.destPlanetName.localeCompare(b.destPlanetName);
            case 'qty':
                return a.quantity - b.quantity;
            case 'buyPrice':
                return a.buyPrice - b.buyPrice;
            case 'sellAdj':
                return a.sellPriceAdj - b.sellPriceAdj;
            case 'gross':
                return a.grossProfit - b.grossProfit;
            case 'depr':
                return a.depreciation - b.depreciation;
            case 'net':
                return a.profitPerTick - b.profitPerTick;
            case 'ticks':
                return a.roundTripTicks - b.roundTripTicks;
        }
    });
    return dir === 'asc' ? sorted : sorted.reverse();
}

// ─── Column header button ─────────────────────────────────────────────────────

function ColHeader({
    col,
    label,
    sortKey,
    sortDir,
    onToggle,
    className,
}: {
    col: SortKey;
    label: string;
    sortKey: SortKey;
    sortDir: SortDir;
    onToggle: (col: SortKey) => void;
    className?: string;
}) {
    return (
        <TableHead
            className={`cursor-pointer select-none whitespace-nowrap ${className ?? ''}`}
            onClick={() => onToggle(col)}
        >
            {label}
            <SortIcon col={col} sortKey={sortKey} dir={sortDir} />
        </TableHead>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TradeRoutesTab() {
    const [shipTypeName, setShipTypeName] = useState<string>('Bulk Carrier 1');
    const [minProfitInput, setMinProfitInput] = useState<string>('0');
    const [scanEnabled, setScanEnabled] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('net');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const minProfit = parseFloat(minProfitInput) || 0;

    const trpc = useTRPC();

    const queryOptions = trpc.simulation.getArbitrageRoutes.queryOptions(
        { shipTypeName },
        { enabled: scanEnabled, staleTime: Infinity },
    );
    const { data, isFetching, dataUpdatedAt, refetch } = useQuery(queryOptions);

    function handleScan() {
        if (scanEnabled) {
            void refetch();
        } else {
            setScanEnabled(true);
        }
    }

    function toggleSort(col: SortKey) {
        setSortKey((k) => {
            if (k === col) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                return k;
            }
            setSortDir('desc');
            return col;
        });
    }

    const filteredAndSorted = useMemo(() => {
        if (!data) {
            return [];
        }
        const filtered = minProfit > 0 ? data.routes.filter((r) => r.profitPerTick >= minProfit) : data.routes;
        return sortRoutes(filtered, sortKey, sortDir);
    }, [data, minProfit, sortKey, sortDir]);

    const scannedAt = dataUpdatedAt > 0 ? new Date(dataUpdatedAt).toLocaleTimeString() : null;
    const totalRoutes = data?.routes.length ?? 0;
    const positiveRoutes = data?.routes.filter((r) => r.profitPerTick > 0).length ?? 0;
    const profitableRoutes = data?.routes.filter((r) => r.profitPerTick >= ARBITRAGE_MIN_PROFIT_PER_TICK).length ?? 0;

    return (
        <div className='space-y-4'>
            {/* Controls */}
            <Card>
                <CardContent className='px-4 py-3'>
                    <div className='flex flex-wrap items-end gap-4'>
                        <div className='flex flex-col gap-1'>
                            <Label className='text-xs text-muted-foreground'>Ship type</Label>
                            <Select value={shipTypeName} onValueChange={setShipTypeName}>
                                <SelectTrigger className='w-52'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SHIP_TYPE_GROUPS.map((group) => {
                                        const options = SHIP_TYPE_OPTIONS.filter((o) => o.group === group);
                                        return options.map((o) => (
                                            <SelectItem key={o.name} value={o.name}>
                                                {o.label}
                                            </SelectItem>
                                        ));
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className='flex flex-col gap-1'>
                            <Label className='text-xs text-muted-foreground'>Min profit/tick filter</Label>
                            <Input
                                type='number'
                                className='w-36'
                                value={minProfitInput}
                                onChange={(e) => setMinProfitInput(e.target.value)}
                                placeholder='0'
                            />
                        </div>

                        <Button onClick={handleScan} disabled={isFetching} className='self-end'>
                            {isFetching ? (
                                <>
                                    <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                                    Scanning…
                                </>
                            ) : (
                                <>
                                    <RefreshCw className='mr-2 h-4 w-4' />
                                    Scan Routes
                                </>
                            )}
                        </Button>

                        {scannedAt && (
                            <span className='text-xs text-muted-foreground self-end pb-0.5'>
                                Last scan: {scannedAt} · tick {data?.tick ?? '?'}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Summary */}
            {data && (
                <div className='flex flex-wrap gap-4 text-sm px-1'>
                    <span>
                        Total routes: <span className='font-semibold font-mono'>{totalRoutes}</span>
                    </span>
                    <span>
                        Positive profit:{' '}
                        <span className='font-semibold font-mono text-amber-600'>{positiveRoutes}</span>
                    </span>
                    <span>
                        Above bot threshold ({ARBITRAGE_MIN_PROFIT_PER_TICK}/tick):{' '}
                        <span className='font-semibold font-mono text-green-600'>{profitableRoutes}</span>
                    </span>
                    {minProfit > 0 && (
                        <span>
                            Showing: <span className='font-semibold font-mono'>{filteredAndSorted.length}</span>
                        </span>
                    )}
                </div>
            )}

            {/* Disclaimer */}
            {data && (
                <p className='text-xs text-muted-foreground px-1'>
                    Assumes ship starts at origin (no repositioning cost). Prices are depth-aware VWAPs from live order
                    books. Forex uses bid-book depth where available, falling back to mid-price ×{' '}
                    {/* ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT constant, just show the value */}
                    0.9. Depreciation based on current EMA ship price ÷ estimated lifetime.
                </p>
            )}

            {/* Empty / not scanned state */}
            {!data && !isFetching && (
                <div className='py-12 text-center text-sm text-muted-foreground'>
                    Select a ship type and click <span className='font-semibold'>Scan Routes</span> to analyse
                    inter-planet arbitrage opportunities.
                </div>
            )}

            {isFetching && <div className='py-12 text-center text-sm text-muted-foreground'>Scanning order books…</div>}

            {/* Results table */}
            {data && !isFetching && filteredAndSorted.length > 0 && (
                <Card>
                    <CardContent className='px-4 pb-3 pt-3'>
                        <div className='border rounded-lg overflow-auto'>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <ColHeader
                                            col='resource'
                                            label='Resource'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                        />
                                        <ColHeader
                                            col='origin'
                                            label='Origin'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                        />
                                        <ColHeader
                                            col='dest'
                                            label='Destination'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                        />
                                        <ColHeader
                                            col='qty'
                                            label='Qty'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                            className='text-right'
                                        />
                                        <ColHeader
                                            col='buyPrice'
                                            label='Buy VWAP'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                            className='text-right'
                                        />
                                        <ColHeader
                                            col='sellAdj'
                                            label='Sell adj.'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                            className='text-right'
                                        />
                                        <ColHeader
                                            col='gross'
                                            label='Gross profit'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                            className='text-right'
                                        />
                                        <ColHeader
                                            col='depr'
                                            label='Depr.'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                            className='text-right'
                                        />
                                        <ColHeader
                                            col='net'
                                            label='Net/tick'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                            className='text-right'
                                        />
                                        <ColHeader
                                            col='ticks'
                                            label='Round-trip'
                                            sortKey={sortKey}
                                            sortDir={sortDir}
                                            onToggle={toggleSort}
                                            className='text-right'
                                        />
                                        <TableHead className='text-right'>FX src</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAndSorted.map((row, i) => (
                                        <TableRow key={i} className='text-xs'>
                                            <TableCell className='font-medium'>{row.resourceName}</TableCell>
                                            <TableCell>{row.originPlanetName}</TableCell>
                                            <TableCell>{row.destPlanetName}</TableCell>
                                            <TableCell className='text-right font-mono'>
                                                {fmt(row.quantity, 0)}
                                            </TableCell>
                                            <TableCell className='text-right font-mono'>
                                                {row.buyPrice.toFixed(2)}
                                            </TableCell>
                                            <TableCell className='text-right font-mono'>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className='cursor-help underline decoration-dotted'>
                                                                {row.sellPriceAdj.toFixed(2)}
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className='text-xs space-y-0.5'>
                                                                <div>Sell at dest: {row.sellPriceDest.toFixed(2)}</div>
                                                                <div>
                                                                    Forex rate: {row.forexRate.toFixed(4)} (
                                                                    {row.forexSource})
                                                                </div>
                                                                <div>Adjusted sell: {row.sellPriceAdj.toFixed(2)}</div>
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                            <TableCell className='text-right font-mono'>
                                                {fmt(row.grossProfit)}
                                            </TableCell>
                                            <TableCell className='text-right font-mono text-muted-foreground'>
                                                {row.depreciation > 0 ? `-${fmt(row.depreciation)}` : '—'}
                                            </TableCell>
                                            <TableCell
                                                className={`text-right font-mono ${profitClass(row.profitPerTick)}`}
                                            >
                                                {row.profitPerTick.toFixed(1)}
                                            </TableCell>
                                            <TableCell className='text-right font-mono'>
                                                {row.roundTripTicks}t
                                            </TableCell>
                                            <TableCell className='text-right'>
                                                {row.forexSource === 'bid-book' ? (
                                                    <Badge
                                                        variant='outline'
                                                        className='text-[9px] px-1 py-0 text-green-600 border-green-400'
                                                    >
                                                        live
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant='outline'
                                                        className='text-[9px] px-1 py-0 text-amber-600 border-amber-400'
                                                    >
                                                        mid×0.9
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {totalRoutes === 200 && (
                            <p className='text-xs text-muted-foreground mt-2'>
                                Showing top 200 routes. Use the min profit filter to narrow results.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {data && !isFetching && filteredAndSorted.length === 0 && (
                <div className='py-8 text-center text-sm text-muted-foreground'>
                    {minProfit > 0
                        ? `No routes with profit/tick ≥ ${minProfit}. Try lowering the filter.`
                        : 'No routes found with positive depth on both sides. Order books may be empty.'}
                </div>
            )}
        </div>
    );
}
