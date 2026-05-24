import { useEffect, useRef, useState } from "react";
import { cn } from "@secretlobby/ui";

interface ResizeHandleProps {
  onResize: (deltaPercent: number) => void;
}

// Drag-to-resize column divider. Always rendered between adjacent columns
// when there are 2+ columns in a section (Phase 3). Style: thin neutral 4px
// vertical handle, brighter violet on hover, brand-red while dragging.
// `mousedown` calls `stopPropagation` so dragging the handle never selects
// the underlying column.
export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const containerWidthRef = useRef<number>(0);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    const sectionEl = (e.target as HTMLElement).closest('[data-section-container]');
    // Use the section container's full client width as the % denominator.
    // SectionComponent's handler converts the % back into pixels using the
    // same width minus gaps, so the math stays consistent. (Previously this
    // subtracted a hard-coded `-32` for assumed padding, but the section
    // has no inner padding — that fudge meant drags computed a wrong %.)
    containerWidthRef.current = sectionEl?.clientWidth || 800;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      // Send any movement past 1px of jitter. The previous 0.3% gate meant
      // sub-pixel drags on wider canvases (where 0.3% > 1px) felt sticky.
      if (Math.abs(deltaX) < 1) return;
      const deltaPercent = (deltaX / containerWidthRef.current) * 100;
      onResizeRef.current(deltaPercent);
      startXRef.current = e.clientX;
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      className={cn(
        "h-full flex items-center justify-center cursor-col-resize z-10 group",
        "w-1 hover:bg-violet-500/20 rounded-sm transition-colors",
        isDragging && "bg-violet-500/30"
      )}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
      title="Drag to resize columns"
    >
      <div
        className={cn(
          "w-1 h-10 rounded-full transition-all",
          isDragging
            ? "bg-[var(--color-brand-red)] h-full"
            : "bg-gray-500/40 group-hover:bg-violet-400 group-hover:h-16"
        )}
      />
    </div>
  );
}
