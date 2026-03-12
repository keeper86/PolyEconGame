import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
    const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

    React.useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const onChange = () => {
            setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        };
        mql.addEventListener('change', onChange);
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return !!isMobile;
}

const SMALL_SCREEN_BREAKPOINT = 400;

export function useIsSmallScreen() {
    const [isSmallScreen, setIsSmallScreen] = React.useState<boolean | undefined>(undefined);

    React.useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${SMALL_SCREEN_BREAKPOINT - 1}px)`);
        const onChange = () => {
            setIsSmallScreen(window.innerWidth < SMALL_SCREEN_BREAKPOINT);
        };
        mql.addEventListener('change', onChange);
        setIsSmallScreen(window.innerWidth < SMALL_SCREEN_BREAKPOINT);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return !!isSmallScreen;
}
