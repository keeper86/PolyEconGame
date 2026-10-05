'use client';

import { useEffect, useRef } from 'react';

export function useResetOnChange(key: string, onReset: () => void): void {
    const previousKeyRef = useRef(key);
    useEffect(() => {
        if (previousKeyRef.current === key) {
            return;
        }
        previousKeyRef.current = key;
        onReset();
    }, [key, onReset]);
}
