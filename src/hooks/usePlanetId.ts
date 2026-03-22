'use client';

import { usePathname } from 'next/navigation';

const PLANET_SEGMENT_PATTERNS = [/^\/planets\/([^/]+)/, /^\/agents\/[^/]+\/([^/]+)/];

export function usePlanetId(): string | null {
    const pathname = usePathname();
    for (const pattern of PLANET_SEGMENT_PATTERNS) {
        const match = pattern.exec(pathname);
        if (match?.[1]) {
            return decodeURIComponent(match[1]);
        }
    }
    return null;
}

export function replacePlanetInPath(pathname: string, newPlanetId: string): string {
    const planetPattern = /^(\/planets\/)([^/]+)(.*)/;
    const agentPattern = /^(\/agents\/[^/]+\/)([^/]+)(.*)/;

    const planetMatch = planetPattern.exec(pathname);
    if (planetMatch) {
        return `${planetMatch[1]}${encodeURIComponent(newPlanetId)}${planetMatch[3]}`;
    }

    const agentMatch = agentPattern.exec(pathname);
    if (agentMatch) {
        return `${agentMatch[1]}${encodeURIComponent(newPlanetId)}${agentMatch[3]}`;
    }

    return `/planets/${encodeURIComponent(newPlanetId)}`;
}
