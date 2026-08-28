'use client';

import type { PageRoute } from '@/components/tour/tourSteps';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

const STORAGE_KEY = 'polyecongame-tour';

type TourStorage = {
    active: boolean;
    currentStepIndex: number;
    completed: boolean;
    completedActions: string[];
};

function isTourStorage(raw: unknown): raw is TourStorage {
    if (typeof raw !== 'object' || raw === null) {
        return false;
    }
    const candidate = raw as Record<string, unknown>;
    return (
        typeof candidate.active === 'boolean' &&
        typeof candidate.currentStepIndex === 'number' &&
        Number.isInteger(candidate.currentStepIndex) &&
        candidate.currentStepIndex >= 0 &&
        typeof candidate.completed === 'boolean' &&
        Array.isArray(candidate.completedActions) &&
        candidate.completedActions.every((action) => typeof action === 'string')
    );
}

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
    currentStepIndex: 0,
    completed: false,
    completedActions: [],
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
    const [storage, setStorage] = useLocalStorageState<TourStorage>(STORAGE_KEY, defaultStorage, isTourStorage);
    const router = useRouter();
    const isTourActiveRef = useRef<boolean>(false);

    useEffect(() => {
        isTourActiveRef.current = storage.active;
    }, [storage.active]);

    const persist = useCallback(
        (update: Partial<TourStorage>) => {
            setStorage((prev) => ({ ...prev, ...update }));
        },
        [setStorage],
    );

    const isTourActive = storage.active;
    const currentStepIndex = storage.currentStepIndex;
    const isCompleted = storage.completed;
    const completedActions = storage.completedActions;

    const setTourActive = useCallback(
        (active: boolean) => {
            persist({ active, currentStepIndex: 0, completed: false, completedActions: [] });
        },
        [persist],
    );

    const setCurrentStepIndex = useCallback(
        (index: number) => {
            persist({ currentStepIndex: index });
        },
        [persist],
    );

    const advanceToNextStep = useCallback(() => {
        setStorage((prev) => ({ ...prev, currentStepIndex: prev.currentStepIndex + 1 }));
    }, [setStorage]);

    const completeTour = useCallback(() => {
        persist({ active: false, completed: true });
    }, [persist]);

    const resetTour = useCallback(() => {
        persist({ active: true, currentStepIndex: 0, completed: false });
    }, [persist]);

    const markActionCompleted = useCallback(
        (action: string) => {
            setStorage((prev) => {
                if (prev.completedActions.includes(action)) {
                    return prev;
                }
                return { ...prev, completedActions: [...prev.completedActions, action] };
            });
        },
        [setStorage],
    );

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
