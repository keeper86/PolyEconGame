'use client';

import React, { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { FacilityInfo, ResourceBalance } from './computeBalance';

interface DependencyGraphProps {
    scales: Record<string, number>;
    facilities: FacilityInfo[];
    balanceByName: Record<string, ResourceBalance>;
}

// x-column for resource nodes, indexed by resource level
const RESOURCE_LEVEL_COL: Record<string, number> = {
    source: 0,
    raw: 2,
    refined: 4,
    manufactured: 6,
    services: 8,
};

// x-column for facility nodes (between their typical input and output level columns)
const FACILITY_LEVEL_COL: Record<string, number> = {
    raw: 1,
    refined: 3,
    manufactured: 5,
    services: 7,
};

const COL_WIDTH = 220;
const ROW_HEIGHT = 80;

const RESOURCE_LEVEL_COLOR: Record<string, { border: string; bg: string }> = {
    source: { border: '#78716c', bg: '#78716c18' },
    raw: { border: '#d97706', bg: '#d9770618' },
    refined: { border: '#2563eb', bg: '#2563eb18' },
    manufactured: { border: '#7c3aed', bg: '#7c3aed18' },
    services: { border: '#059669', bg: '#05966918' },
};

const FACILITY_LEVEL_COLOR: Record<string, { border: string; bg: string }> = {
    raw: { border: '#b45309', bg: '#b4530928' },
    refined: { border: '#1d4ed8', bg: '#1d4ed828' },
    manufactured: { border: '#6d28d9', bg: '#6d28d928' },
    services: { border: '#047857', bg: '#04785728' },
};

function fmt(n: number): string {
    if (Math.abs(n) >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(n) >= 1_000) {
        return `${(n / 1_000).toFixed(1)}k`;
    }
    return n.toFixed(0);
}

export default function DependencyGraph({ scales, facilities, balanceByName }: DependencyGraphProps) {
    const { nodes, edges } = useMemo(() => {
        const activeFacilities = facilities.filter((f) => (scales[f.name] ?? 0) > 0);
        if (activeFacilities.length === 0) {
            return { nodes: [], edges: [] };
        }

        // Collect resources referenced by active facilities
        const activeResourceNames = new Set<string>();
        for (const f of activeFacilities) {
            for (const p of f.produces) {
                activeResourceNames.add(p.resourceName);
            }
            for (const n of f.needs) {
                activeResourceNames.add(n.resourceName);
            }
        }

        // Group resources and facilities by their level column
        const resourcesByCol = new Map<number, string[]>();
        for (const name of activeResourceNames) {
            const bal = balanceByName[name];
            if (!bal) {
                continue;
            }
            const col = RESOURCE_LEVEL_COL[bal.resourceLevel] ?? 0;
            if (!resourcesByCol.has(col)) {
                resourcesByCol.set(col, []);
            }
            resourcesByCol.get(col)!.push(name);
        }
        for (const [, list] of resourcesByCol) {
            list.sort();
        }

        const facilitiesByCol = new Map<number, FacilityInfo[]>();
        for (const f of activeFacilities) {
            const col = FACILITY_LEVEL_COL[f.primaryOutputLevel] ?? 1;
            if (!facilitiesByCol.has(col)) {
                facilitiesByCol.set(col, []);
            }
            facilitiesByCol.get(col)!.push(f);
        }
        for (const [, list] of facilitiesByCol) {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        // Resource nodes
        for (const [col, names] of resourcesByCol) {
            const x = col * COL_WIDTH;
            names.forEach((name, i) => {
                const bal = balanceByName[name];
                const colors = RESOURCE_LEVEL_COLOR[bal?.resourceLevel ?? 'raw'] ?? RESOURCE_LEVEL_COLOR.raw!;
                const balance = bal?.balance ?? 0;
                const isSource = bal?.isExternalSource ?? false;

                // Balance indicator colour overrides border for non-source nodes
                const borderColor = isSource
                    ? colors.border
                    : balance < -0.001
                      ? '#dc2626'
                      : balance > 0.001
                        ? '#16a34a'
                        : colors.border;

                nodes.push({
                    id: `res::${name}`,
                    type: 'default',
                    position: { x, y: i * ROW_HEIGHT },
                    data: {
                        label: (
                            <div className='text-center leading-tight'>
                                <div className='text-xs font-semibold'>{name}</div>
                                {!isSource && (
                                    <div
                                        className='text-[10px] mt-0.5'
                                        style={{ color: balance < -0.001 ? '#dc2626' : '#16a34a' }}
                                    >
                                        {balance >= 0 ? '+' : ''}
                                        {fmt(balance)}/t
                                    </div>
                                )}
                                {isSource && <div className='text-[10px] text-stone-400 mt-0.5'>deposit ∞</div>}
                            </div>
                        ),
                    },
                    style: {
                        border: `2px solid ${borderColor}`,
                        borderRadius: 8,
                        background: colors.bg,
                        width: 150,
                        fontSize: 11,
                        padding: 4,
                    },
                });
            });
        }

        // Facility nodes
        for (const [col, facs] of facilitiesByCol) {
            const x = col * COL_WIDTH;
            const colors =
                FACILITY_LEVEL_COLOR[Object.entries(FACILITY_LEVEL_COL).find(([, c]) => c === col)?.[0] ?? 'raw'] ??
                FACILITY_LEVEL_COLOR.raw!;

            facs.forEach((f, i) => {
                const scale = scales[f.name] ?? 0;
                nodes.push({
                    id: `fac::${f.name}`,
                    type: 'default',
                    position: { x, y: i * ROW_HEIGHT },
                    data: {
                        label: (
                            <div className='text-center leading-tight'>
                                <div className='text-xs font-semibold'>{f.name}</div>
                                <div className='text-[10px] text-stone-500 mt-0.5'>×{scale}</div>
                            </div>
                        ),
                    },
                    style: {
                        border: `2px solid ${colors.border}`,
                        borderRadius: 4,
                        background: colors.bg,
                        width: 170,
                        fontSize: 11,
                        padding: 4,
                    },
                });
            });
        }

        // Edges
        for (const f of activeFacilities) {
            const scale = scales[f.name] ?? 0;

            for (const need of f.needs) {
                if (!activeResourceNames.has(need.resourceName)) {
                    continue;
                }
                edges.push({
                    id: `e::${need.resourceName}→${f.name}`,
                    source: `res::${need.resourceName}`,
                    target: `fac::${f.name}`,
                    label: `${fmt(need.quantity * scale)}/t`,
                    animated: true,
                    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
                    labelStyle: { fontSize: 9, fill: '#64748b' },
                    labelBgStyle: { fill: 'transparent' },
                });
            }

            for (const prod of f.produces) {
                if (!activeResourceNames.has(prod.resourceName)) {
                    continue;
                }
                edges.push({
                    id: `e::${f.name}→${prod.resourceName}`,
                    source: `fac::${f.name}`,
                    target: `res::${prod.resourceName}`,
                    label: `${fmt(prod.quantity * scale)}/t`,
                    animated: true,
                    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
                    labelStyle: { fontSize: 9, fill: '#64748b' },
                    labelBgStyle: { fill: 'transparent' },
                });
            }
        }

        return { nodes, edges };
    }, [scales, facilities, balanceByName]);

    if (nodes.length === 0) {
        return (
            <div className='flex items-center justify-center h-64 border rounded-lg bg-muted/20 text-muted-foreground text-sm'>
                Set facility scales in the <strong className='mx-1'>Facilities</strong> tab to see the dependency graph.
            </div>
        );
    }

    return (
        <div style={{ height: 700 }} className='border rounded-lg overflow-hidden'>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.1 }}
                nodesDraggable
                nodesConnectable={false}
                elementsSelectable={false}
                minZoom={0.2}
            >
                <Background gap={20} />
                <Controls />
                <MiniMap nodeColor={(n) => (n.style?.border as string | undefined) ?? '#94a3b8'} />
            </ReactFlow>
        </div>
    );
}
