'use client';

import type { PageRoute } from '@/components/tour/tourSteps';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'polyecongame-tour';

type TourStorage = {
    active: boolean;
    currentPageIndex: number;
    completed: boolean;
    completedActions: string[];
};

type TourContextValue = {
    isTourActive: boolean;
    setTourActive: (active: boolean) => void;
    currentStepIndex: number;
    setCurrentStepIndex: (index: number) => void;
    isCompleted: boolean;
    completeTour: () => void;
    resetTour: () => void;
    goToNextPage: (currentPage: PageRoute, planetId: string, agentId: string) => void;
    advanceToNextStep: () => void;
    isTourActiveRef: React.RefObject<boolean>;
    completedActions: string[];
    markActionCompleted: (action: string) => void;
};

const PAGE_ORDER: PageRoute[] = ['financial', 'workforce', 'market', 'production', 'claims', 'storage', 'ships'];

const defaultStorage: TourStorage = {
    active: false,
    currentPageIndex: 0,
    completed: false,
    completedActions: [],
};

function loadStorage(): TourStorage {
    if (typeof window === 'undefined') {
        return defaultStorage;
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as TourStorage;
            const merged = { ...defaultStorage, ...parsed, completedActions: parsed.completedActions ?? [] };
            if (merged.currentPageIndex >= PAGE_ORDER.length) {
                merged.currentPageIndex = 0;
            }
            return merged;
        }
    } catch {
        console.warn('[tour] Failed to load tour storage from localStorage');
    }
    return defaultStorage;
}

function saveStorage(storage: TourStorage): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    } catch {
        console.warn('[tour] Failed to save tour storage to localStorage');
    }
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
    const [storage, setStorage] = useState<TourStorage>(defaultStorage);
    const router = useRouter();
    const isTourActiveRef = useRef<boolean>(false);

    useEffect(() => {
        setStorage(loadStorage());
    }, []);

    useEffect(() => {
        isTourActiveRef.current = storage.active;
    }, [storage.active]);

    const persist = useCallback((update: Partial<TourStorage>) => {
        setStorage((prev) => {
            const next = { ...prev, ...update };
            saveStorage(next);
            return next;
        });
    }, []);

    const isTourActive = storage.active;
    const currentStepIndex = storage.currentPageIndex;
    const isCompleted = storage.completed;
    const completedActions = storage.completedActions;

    const setTourActive = useCallback(
        (active: boolean) => {
            persist({ active, currentPageIndex: 0, completed: false, completedActions: [] });
        },
        [persist],
    );

    const setCurrentStepIndex = useCallback(
        (index: number) => {
            persist({ currentPageIndex: index });
        },
        [persist],
    );

    const advanceToNextStep = useCallback(() => {
        setStorage((prev) => {
            const next = { ...prev, currentPageIndex: prev.currentPageIndex + 1 };
            saveStorage(next);
            return next;
        });
    }, []);

    const completeTour = useCallback(() => {
        persist({ active: false, completed: true });
    }, [persist]);

    const resetTour = useCallback(() => {
        persist({ active: true, currentPageIndex: 0, completed: false });
    }, [persist]);

    const markActionCompleted = useCallback((action: string) => {
        setStorage((prev) => {
            if (prev.completedActions.includes(action)) {
                return prev;
            }
            const next = {
                ...prev,
                completedActions: [...prev.completedActions, action],
            };
            saveStorage(next);
            return next;
        });
    }, []);

    const goToNextPage = useCallback(
        (currentPage: PageRoute, planetId: string, agentId: string) => {
            const currentPageIdx = PAGE_ORDER.indexOf(currentPage);
            const nextPageIdx = currentPageIdx + 1;
            if (nextPageIdx >= PAGE_ORDER.length) {
                completeTour();
                return;
            }
            const nextPage = PAGE_ORDER[nextPageIdx];
            const basePath = `/planets/${encodeURIComponent(planetId)}`;

            let path = '';
            switch (nextPage) {
                case 'financial':
                    path = `${basePath}/agent/${encodeURIComponent(agentId)}/financial`;
                    break;
                case 'workforce':
                    path = `${basePath}/agent/${encodeURIComponent(agentId)}/workforce`;
                    break;
                case 'claims':
                    path = `${basePath}/claims`;
                    break;
                case 'production':
                    path = `${basePath}/agent/${encodeURIComponent(agentId)}/production`;
                    break;
                case 'storage':
                    path = `${basePath}/agent/${encodeURIComponent(agentId)}/storage`;
                    break;
                case 'market':
                    path = `${basePath}/agent/${encodeURIComponent(agentId)}/market`;
                    break;
                case 'ships':
                    path = `${basePath}/agent/${encodeURIComponent(agentId)}/ships`;
                    break;
            }

            router.push(path as unknown as '/');
        },
        [completeTour, router],
    );

    return (
        <TourContext.Provider
            value={{
                isTourActive,
                setTourActive,
                currentStepIndex,
                setCurrentStepIndex,
                isCompleted,
                completeTour,
                resetTour,
                goToNextPage,
                advanceToNextStep,
                isTourActiveRef,
                completedActions,
                markActionCompleted,
            }}
        >
            {children}
        </TourContext.Provider>
    );
}

export function useTour(): TourContextValue {
    const ctx = useContext(TourContext);
    if (!ctx) {
        throw new Error('useTour must be used within a TourProvider');
    }
    return ctx;
}
