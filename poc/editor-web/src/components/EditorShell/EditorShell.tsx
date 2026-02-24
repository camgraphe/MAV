import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type EditorLayout = {
  leftPx: number;
  rightPx: number;
  bottomPx: number;
  sourceSplitPct: number;
};

type DragMode = "left" | "right" | "bottom";

type SplitterDragState = {
  pointerId: number;
  mode: DragMode;
  startX: number;
  startY: number;
  startLayout: EditorLayout;
};

const LEFT_MIN_PX = 220;
const LEFT_MAX_PX = 760;
const RIGHT_MIN_PX = 260;
const RIGHT_MAX_PX = 760;
const BOTTOM_MIN_PX = 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bottomMaxPx(viewportHeight: number): number {
  return Math.max(BOTTOM_MIN_PX, Math.floor(viewportHeight * 0.62));
}

function defaultBottomPx(viewportHeight: number): number {
  return clamp(Math.round(viewportHeight * 0.34), BOTTOM_MIN_PX, bottomMaxPx(viewportHeight));
}

type EditorShellProps = {
  toolbar: ReactNode;
  mediaBin: ReactNode;
  preview: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
  layout: EditorLayout;
  onResizeLayout: (patch: Partial<EditorLayout>) => void;
  onResizeLayoutCommit: () => void;
  isDesktopResizable: boolean;
  diagnostics?: ReactNode;
  status: ReactNode;
};

export function EditorShell({
  toolbar,
  mediaBin,
  preview,
  inspector,
  timeline,
  layout,
  onResizeLayout,
  onResizeLayoutCommit,
  isDesktopResizable,
  diagnostics,
  status,
}: EditorShellProps) {
  const dragRef = useRef<SplitterDragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<Partial<EditorLayout> | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  const shellStyle = useMemo(
    () =>
      ({
        "--pane-left": `${layout.leftPx}px`,
        "--pane-right": `${layout.rightPx}px`,
        "--pane-bottom": `${layout.bottomPx}px`,
      }) as CSSProperties,
    [layout.leftPx, layout.rightPx, layout.bottomPx],
  );

  const flushPatch = () => {
    const pending = pendingPatchRef.current;
    pendingPatchRef.current = null;
    if (!pending) return;
    onResizeLayout(pending);
  };

  const schedulePatch = (patch: Partial<EditorLayout>) => {
    pendingPatchRef.current = patch;
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      flushPatch();
    });
  };

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const viewportHeight = window.innerHeight || 900;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (drag.mode === "left") {
        schedulePatch({ leftPx: clamp(drag.startLayout.leftPx + deltaX, LEFT_MIN_PX, LEFT_MAX_PX) });
        return;
      }
      if (drag.mode === "right") {
        schedulePatch({ rightPx: clamp(drag.startLayout.rightPx - deltaX, RIGHT_MIN_PX, RIGHT_MAX_PX) });
        return;
      }
      schedulePatch({
        bottomPx: clamp(drag.startLayout.bottomPx - deltaY, BOTTOM_MIN_PX, bottomMaxPx(viewportHeight)),
      });
    };

    const onStop = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      flushPatch();
      dragRef.current = null;
      setDragMode(null);
      onResizeLayoutCommit();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onStop);
    window.addEventListener("pointercancel", onStop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onStop);
      window.removeEventListener("pointercancel", onStop);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [onResizeLayout, onResizeLayoutCommit]);

  const onSplitterPointerDown = (event: ReactPointerEvent<HTMLElement>, mode: DragMode) => {
    if (!isDesktopResizable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: layout,
    };
    setDragMode(mode);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResetDimension = (mode: DragMode) => {
    const viewportHeight = window.innerHeight || 900;
    if (mode === "left") {
      onResizeLayout({ leftPx: 280 });
    } else if (mode === "right") {
      onResizeLayout({ rightPx: 320 });
    } else {
      onResizeLayout({ bottomPx: defaultBottomPx(viewportHeight) });
    }
    onResizeLayoutCommit();
  };

  return (
    <main className="editorShell" style={shellStyle}>
      <header className="editorTop panel">{toolbar}</header>

      <aside className="editorLeft panel resizablePane">
        {mediaBin}
        {isDesktopResizable ? (
          <div
            role="separator"
            aria-label="Resize left panel"
            aria-orientation="vertical"
            className={`shellSplitter shellSplitterLeft ${dragMode === "left" ? "isDragging" : ""}`}
            onPointerDown={(event) => onSplitterPointerDown(event, "left")}
            onDoubleClick={() => onResetDimension("left")}
          />
        ) : null}
      </aside>

      <section className="editorCenter panel">{preview}</section>

      <aside className="editorRight panel resizablePane">
        {inspector}
        {isDesktopResizable ? (
          <div
            role="separator"
            aria-label="Resize right panel"
            aria-orientation="vertical"
            className={`shellSplitter shellSplitterRight ${dragMode === "right" ? "isDragging" : ""}`}
            onPointerDown={(event) => onSplitterPointerDown(event, "right")}
            onDoubleClick={() => onResetDimension("right")}
          />
        ) : null}
      </aside>

      <section className="editorBottom panel">
        {timeline}
        {isDesktopResizable ? (
          <div
            role="separator"
            aria-label="Resize timeline panel"
            aria-orientation="horizontal"
            className={`shellSplitter shellSplitterBottom ${dragMode === "bottom" ? "isDragging" : ""}`}
            onPointerDown={(event) => onSplitterPointerDown(event, "bottom")}
            onDoubleClick={() => onResetDimension("bottom")}
          />
        ) : null}
      </section>

      {diagnostics ? <section className="editorDiagnostics panel">{diagnostics}</section> : null}

      <footer className="editorStatus panel log">{status}</footer>
    </main>
  );
}
