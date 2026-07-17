import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

/**
 * Drag-to-resize a pane's width (e.g. a tree panel next to its content
 * area), matching how the real Windows tools' split panes behave. Persists
 * the chosen width per `storageKey` so it survives reloads, the same way a
 * real desktop app remembers window/pane layout across sessions.
 */
export function useResizablePane(storageKey: string, defaultWidth: number, min = 180, max = 640) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const stored = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? Math.min(max, Math.max(min, stored)) : defaultWidth;
  });
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragState.current) return;
      const delta = e.clientX - dragState.current.startX;
      setWidth(Math.min(max, Math.max(min, dragState.current.startWidth + delta)));
    }
    function onMouseUp() {
      if (!dragState.current) return;
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => {
        window.localStorage.setItem(storageKey, String(w));
        return w;
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [storageKey, min, max]);

  const onResizeMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      dragState.current = { startX: e.clientX, startWidth: width };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  return { width, onResizeMouseDown };
}
