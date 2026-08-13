import type { CSSProperties, ReactNode } from 'react';

export const GAUGE_ARC_START_DEG = -135;
export const GAUGE_ARC_SWEEP_DEG = 270;
export const MIN_TICK_LABEL_SEPARATION_DEG = 12.5;
export const MIN_ZONE_ARC_DEG = 8;
export const TICK_LABEL_NUDGE_PX = 10;

export function getTickAngle(value: number, maxValue: number): number {
    const safeMax = maxValue > 0 ? maxValue : 1;
    const ratio = Math.max(0, Math.min(1, value / safeMax));
    return ratio * GAUGE_ARC_SWEEP_DEG + GAUGE_ARC_START_DEG;
}

export function getRadialNudge(value: number, maxValue: number, nudgePx: number = TICK_LABEL_NUDGE_PX): CSSProperties {
    const angleRad = getTickAngle(value, maxValue) * (Math.PI / 180);
    return {
        transform: `translate(${(Math.sin(angleRad) * nudgePx).toFixed(2)}px, 0px)`,
    };
}

export type GaugeZone = {
    from: number;
    to: number;
    color: string;
};

export type ResolvedSubArc = {
    limit: number;
    color: string;
};

export function resolveZones(zones: GaugeZone[], maxValue: number): ResolvedSubArc[] {
    const arcs: ResolvedSubArc[] = [];
    let start = 0;

    for (let i = 0; i < zones.length; i++) {
        const isLast = i === zones.length - 1;
        const from = Math.max(zones[i].from, start, 0);
        const to = Math.min(zones[i].to, maxValue);

        if (isLast) {
            if (start < maxValue) {
                arcs.push({ limit: maxValue, color: zones[i].color });
            }
            continue;
        }

        if (to <= from) {
            continue;
        }
        if (getTickAngle(to, maxValue) - getTickAngle(from, maxValue) < MIN_ZONE_ARC_DEG) {
            continue;
        }

        arcs.push({ limit: to, color: zones[i].color });
        start = to;
    }

    return arcs;
}

export type TickLabelCandidate = {
    value: number;
    priority: number;
    renderContent: () => ReactNode;
};

export function resolveTickLabels(candidates: TickLabelCandidate[], maxValue: number): TickLabelCandidate[] {
    const inRange = candidates.filter((candidate) => candidate.value >= 0 && candidate.value <= maxValue);
    const byPriority = [...inRange].sort((a, b) => a.priority - b.priority);
    const keptAngles: number[] = [];
    const kept: TickLabelCandidate[] = [];

    for (const candidate of byPriority) {
        const angle = getTickAngle(candidate.value, maxValue);
        const tooClose = keptAngles.some((keptAngle) => Math.abs(keptAngle - angle) < MIN_TICK_LABEL_SEPARATION_DEG);
        if (!tooClose) {
            keptAngles.push(angle);
            kept.push(candidate);
        }
    }

    return kept.sort((a, b) => a.value - b.value);
}
