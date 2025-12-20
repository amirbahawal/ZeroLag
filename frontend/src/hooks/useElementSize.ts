import { useState, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface Size {
    width: number;
    height: number;
}

export function useElementSize<T extends HTMLElement = HTMLDivElement>(): [RefObject<T | null>, Size] {
    const ref = useRef<T>(null);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const updateSize = () => {
            setSize({
                width: element.offsetWidth,
                height: element.offsetHeight,
            });
        };

        updateSize();

        const resizeObserver = new ResizeObserver((entries) => {
            if (!entries?.length) return;
            const { width, height } = entries[0].contentRect;
            setSize({ width: Math.floor(width), height: Math.floor(height) });
        });

        resizeObserver.observe(element);
        return () => resizeObserver.disconnect();
    }, []);

    return [ref, size];
}
