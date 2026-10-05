import { useEffect } from 'react';

export function useDocumentVisibility(onHide: () => void, onShow: () => void): void {
    useEffect(() => {
        const handle = () => {
            if (document.visibilityState === 'visible') {
                onShow();
            } else {
                onHide();
            }
        };
        handle();
        document.addEventListener('visibilitychange', handle);
        return () => document.removeEventListener('visibilitychange', handle);
    }, [onHide, onShow]);
}
