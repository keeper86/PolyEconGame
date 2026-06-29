'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface GameConfig {
    tickIntervalMs: number;
}

const GameConfigContext = createContext<GameConfig | null>(null);

export function GameConfigProvider({
    tickIntervalMs,
    children,
}: {
    tickIntervalMs: number;
    children: ReactNode;
}): React.ReactElement {
    return <GameConfigContext.Provider value={{ tickIntervalMs }}>{children}</GameConfigContext.Provider>;
}

export function useGameConfig(): GameConfig {
    const ctx = useContext(GameConfigContext);
    if (!ctx) {
        throw new Error('useGameConfig must be used within a GameConfigProvider');
    }
    return ctx;
}
