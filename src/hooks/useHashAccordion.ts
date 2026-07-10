import { useCallback, useEffect, useRef, useState } from 'react';

const STICKY_HEADER_OFFSET = 72;

/** Duration of the accordion CSS animation (accordion-down/accordion-up) before settling. */
const ACCORDION_ANIMATION_DURATION_MS = 200;

type Options = {
    toSlug?: (value: string) => string;

    fromSlug?: (slug: string) => string | undefined;
};

type Result = {
    openItem: string | undefined;

    onValueChange: (value: string | undefined) => void;

    hashItem: string | undefined;
};

function readHash(fromSlug: (slug: string) => string | undefined): string | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    const slug = window.location.hash.slice(1);
    if (!slug) {
        return undefined;
    }
    return fromSlug(slug) ?? undefined;
}

export function useHashAccordion({ toSlug = (v) => v, fromSlug = (s) => s }: Options = {}): Result {
    const [hashItem, setHashItem] = useState<string | undefined>(() => readHash(fromSlug));

    const [openItem, setOpenItem] = useState<string | undefined>(() => readHash(fromSlug) ?? undefined);

    // On mount / hash change, open the accordion item matching the URL hash.
    useEffect(() => {
        const value = readHash(fromSlug);
        if (value) {
            setHashItem(value);
            setOpenItem(value);
        } else {
            setHashItem(undefined);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Tracks which item we last scrolled to, so we can re-scroll when the target changes.
    const lastScrolledItem = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!openItem || openItem === lastScrolledItem.current) {
            return;
        }
        const slug = toSlug(openItem);
        const doScroll = () => {
            const el = document.getElementById(slug);
            if (el) {
                lastScrolledItem.current = openItem;
                const top = el.getBoundingClientRect().top + window.scrollY - STICKY_HEADER_OFFSET;
                window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            }
        };
        // Wait for the accordion open animation to finish before measuring position.
        const rafId = requestAnimationFrame(() => {
            setTimeout(doScroll, ACCORDION_ANIMATION_DURATION_MS);
        });
        return () => cancelAnimationFrame(rafId);
    }, [openItem, toSlug]);

    const onValueChange = useCallback(
        (value: string | undefined) => {
            setOpenItem(value);
            // Allow scrolling again if the accordion is re-opened to a different item.
            if (!value) {
                lastScrolledItem.current = undefined;
            }
            setHashItem(undefined);
            if (value) {
                window.history.replaceState(null, '', `#${toSlug(value)}`);
            } else {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        },
        [toSlug],
    );

    return { openItem, onValueChange, hashItem };
}
