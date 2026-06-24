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
    /** Whether the user opted in for the tour */
    isTourActive: boolean;
    /** Set tour opt-in (called from FoundingPage) */
    setTourActive: (active: boolean) => void;
    /** The current page index in the tour sequence */
    currentPageIndex: number;
    /** Set the current page index */
    setCurrentPageIndex: (index: number) => void;
    /** Whether the tour is completed */
    isCompleted: boolean;
    /** Mark tour as completed */
    completeTour: () => void;
    /** Reset the tour */
    resetTour: () => void;
    /** Get the page route for the current index */
    getCurrentPageRoute: () => PageRoute | null;
    /** Navigate to the next tour page */
    goToNextPage: (planetId: string, agentId: string) => void;
    /** Advance to the next step on the current page (increment currentPageIndex by 1) */
    advanceToNextStep: () => void;
    /** Ref that mirrors isTourActive for use in callbacks */
    isTourActiveRef: React.RefObject<boolean>;
    /** List of action keys that have been completed (e.g. 'starter-loan') */
    completedActions: string[];
    /** Mark an action as completed (deduplicates, persists) */
    markActionCompleted: (action: string) => void;
};

const PAGE_ORDER: PageRoute[] = [
    'central-bank',
    'financial',
    'workforce',
    'claims',
    'production',
    'storage',
    'market',
    'ships',
];

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
            return { ...defaultStorage, ...parsed, completedActions: parsed.completedActions ?? [] };
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

    // Keep ref in sync with storage
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
    const currentPageIndex = storage.currentPageIndex;
    const isCompleted = storage.completed;
    const completedActions = storage.completedActions;

    const setTourActive = useCallback(
        (active: boolean) => {
            persist({ active, currentPageIndex: 0, completed: false, completedActions: [] });
        },
        [persist],
    );

    const setCurrentPageIndex = useCallback(
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
        // Reset to financial page (index 1), preserving completedActions so
        // already-completed steps (e.g. starter loan) are skipped.
        persist({ active: true, currentPageIndex: 1, completed: false });
    }, [persist]);

    const markActionCompleted = useCallback((action: string) => {
        setStorage((prev) => {
            if (prev.completedActions.includes(action)) {
                return prev; // already tracked
            }
            const next = {
                ...prev,
                completedActions: [...prev.completedActions, action],
            };
            saveStorage(next);
            return next;
        });
    }, []);

    const getCurrentPageRoute = useCallback((): PageRoute | null => {
        if (storage.currentPageIndex >= 0 && storage.currentPageIndex < PAGE_ORDER.length) {
            return PAGE_ORDER[storage.currentPageIndex];
        }
        return null;
    }, [storage.currentPageIndex]);

    const goToNextPage = useCallback(
        (planetId: string, agentId: string) => {
            const nextIndex = storage.currentPageIndex + 1;
            if (nextIndex >= PAGE_ORDER.length) {
                completeTour();
                return;
            }
            const nextPage = PAGE_ORDER[nextIndex];
            const basePath = `/planets/${encodeURIComponent(planetId)}`;

            let path = '';
            switch (nextPage) {
                case 'central-bank':
                    path = `${basePath}/central-bank`;
                    break;
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

            persist({ currentPageIndex: nextIndex });
            router.push(path as unknown as '/');
        },
        [storage.currentPageIndex, completeTour, persist, router],
    );

    return (
        <TourContext.Provider
            value={{
                isTourActive,
                setTourActive,
                currentPageIndex,
                setCurrentPageIndex,
                isCompleted,
                completeTour,
                resetTour,
                getCurrentPageRoute,
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
