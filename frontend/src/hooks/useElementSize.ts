/**
 * useElementSize Hook
 * 
 * Tracks the size of a DOM element using ResizeObserver.
 * Returns width and height that update on resize.
 */

import { useState, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface Size {
    width: number;
    height: number;
}

/**
 * Hook to observe element size changes
 * 
 * @returns Tuple of [ref, size] where ref should be attached to the element
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>(): [
    RefObject<T | null>,
    Size
] {
    const ref = useRef<T>(null);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        // Set initial size
        const updateSize = () => {
            setSize({
                width: element.offsetWidth,
                height: element.offsetHeight,
            });
        };

        // Initial measurement
        updateSize();

        // Create ResizeObserver
        const resizeObserver = new ResizeObserver((entries) => {
            if (!entries || entries.length === 0) return;

            const entry = entries[0];
            const { width, height } = entry.contentRect;

            setSize({
                width: Math.floor(width),
                height: Math.floor(height),
            });
        });

        // Observe element
        resizeObserver.observe(element);

        // Cleanup
        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    return [ref, size];
}
