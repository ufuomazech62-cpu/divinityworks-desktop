import { useState, useEffect } from "react";

/**
 * Detects whether the current viewport is a mobile device.
 * Uses matchMedia for real-time updates when the viewport changes
 * (e.g. orientation change, window resize).
 *
 * @param breakpoint - pixel width below which we consider "mobile" (default 768)
 * @returns { isMobile: boolean }
 */
export function useMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    // Sync on mount in case the initial state was wrong
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Detects touch capability — useful for deciding whether to show
 * hover-dependent UI (tooltips, dropdowns) or use tap alternatives.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isTouch;
}
