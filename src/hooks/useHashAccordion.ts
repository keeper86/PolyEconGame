import { useEffect, useRef, useState } from 'react';

const STICKY_HEADER_OFFSET = 72;

type Options = {
    toSlug?: (value: string) => string;

    fromSlug?: (slug: string) => string | undefined;
};

type Result = {
    openItem: string | undefined;

    onValueChange: (value: string | undefined) => void;

    hashItem: string | undefined;
};

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
