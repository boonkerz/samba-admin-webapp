import type { MouseEvent } from "react";

/** Thin draggable divider between a resizable pane and its neighbor; pair with useResizablePane. */
export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative w-1 shrink-0 cursor-col-resize select-none"
      role="separator"
      aria-orientation="vertical"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="h-full w-full bg-transparent group-hover:bg-indigo-400/60 group-active:bg-indigo-500" />
    </div>
  );
}
