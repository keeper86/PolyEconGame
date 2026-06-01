import { useEffect, useRef, useState } from 'react';

// Height of the sticky page header (h-12 sm:h-14 = 48–56px; use 72px for safe margin).
const STICKY_HEADER_OFFSET = 72;

type Options = {
    /** Convert an accordion value to a URL hash fragment. Defaults to identity. */
    toSlug?: (value: string) => string;
    /** Convert a URL hash fragment back to an accordion value. Return undefined if unrecognised. Defaults to identity. */
    fromSlug?: (slug: string) => string | undefined;
};

type Result = {
    /** Currently open accordion item value. */
    openItem: string | undefined;
    /** Call this as the Accordion `onValueChange` handler. Updates state + URL hash. */
    onValueChange: (value: string | undefined) => void;
    /**
     * The value that was derived from the URL hash on mount, before the user has
     * interacted with the accordion. Becomes `undefined` as soon as the user opens
     * or closes any item. Useful for side-effects like forcing a resource into a
     * filtered list purely because it was hash-linked.
     */
    hashItem: string | undefined;
};

/**
 * Synchronises a single-select accordion with the URL hash fragment.
 *
 * - On mount the current hash is read and used to pre-open the matching item.
 * - After Next.js soft navigation the hash may arrive slightly late; a mount-time
 *   effect hydrates the state once the browser applies the new URL.
 * - When an item is opened the hash is updated via `history.replaceState`; when
 *   closed the hash is cleared.
 * - The first time an item is opened via the hash the page scrolls to bring it into
 *   view, accounting for the sticky header.
 */
export function useHashAccordion({ toSlug = (v) => v, fromSlug = (s) => s }: Options = {}): Result {
    const [hashItem, setHashItem] = useState<string | undefined>(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const slug = window.location.hash.slice(1);
        return slug ? (fromSlug(slug) ?? undefined) : undefined;
    });

    const [openItem, setOpenItem] = useState<string | undefined>(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const slug = window.location.hash.slice(1);
        return slug ? (fromSlug(slug) ?? undefined) : undefined;
    });

    // During Next.js soft navigation, window.location.hash may not be set yet when
    // the useState initialisers run synchronously. Read the hash in a useEffect
    // (which fires after the browser has applied the new URL) and hydrate the states.
    useEffect(() => {
        const slug = window.location.hash.slice(1);
        if (!slug) {
            return;
        }
        const value = fromSlug(slug) ?? undefined;
        if (!value) {
            return;
        }
        setHashItem((prev) => prev ?? value);
        setOpenItem((prev) => prev ?? value);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll to the element when auto-opened from the hash on mount.
    const hasScrolled = useRef(false);
    useEffect(() => {
        if (!openItem || hasScrolled.current) {
            return;
        }
        const slug = toSlug(openItem);
        const el = document.getElementById(slug);
        if (el) {
            hasScrolled.current = true;
            setTimeout(() => {
                const top = el.getBoundingClientRect().top + window.scrollY - STICKY_HEADER_OFFSET;
                window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            }, 50);
        }
    }, [openItem]); // eslint-disable-line react-hooks/exhaustive-deps

    const onValueChange = (value: string | undefined) => {
        setOpenItem(value);
        setHashItem(undefined);
        if (value) {
            window.history.replaceState(null, '', `#${toSlug(value)}`);
        } else {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    };

    return { openItem, onValueChange, hashItem };
}
