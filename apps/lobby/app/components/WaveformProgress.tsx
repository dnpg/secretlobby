import { useEffect, useRef } from "react";

interface WaveformProgressProps {
  waveformPeaks: number[] | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  audioElement?: HTMLAudioElement | null;
  borderShow?: boolean;
  borderColor?: string;
  borderRadius?: number;
  blendMode?: string;
}

function getThemeColor(element: Element | null, varName: string, fallback: string): string {
  if (typeof document === "undefined" || !element) return fallback;
  const value = getComputedStyle(element).getPropertyValue(varName).trim();
  return value || fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  }
  return `rgba(255, 255, 255, ${alpha})`;
}

export function WaveformProgress({
  waveformPeaks,
  currentTime,
  duration,
  isPlaying,
  audioElement,
  borderShow,
  borderColor,
  borderRadius,
  blendMode,
}: WaveformProgressProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Refs for rapidly-changing values so rAF loop doesn't need re-renders
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const peaksRef = useRef(waveformPeaks);

  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  peaksRef.current = waveformPeaks;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctxOrNull = canvas.getContext("2d");
    if (!ctxOrNull) return;
    const ctx = ctxOrNull;

    const bgColor = getThemeColor(canvas, "--color-visualizer-bg", "#111827");
    const bgOpacity = parseFloat(getThemeColor(canvas, "--color-visualizer-bg-opacity", "0")) || 0;
    const barColor = getThemeColor(canvas, "--color-visualizer-bar", "#ffffff");
    const barAltColor = getThemeColor(canvas, "--color-visualizer-bar-alt", "#9ca3af");
    const glowColor = getThemeColor(canvas, "--color-visualizer-glow", "#ffffff");

    const centerY = canvas.height / 2;

    function draw() {
      const peaks = peaksRef.current;
      const dur = durationRef.current;
      const time = audioElement && isPlaying ? audioElement.currentTime : currentTimeRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgOpacity > 0) {
        ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (!peaks || peaks.length === 0) return;

      const barCount = peaks.length;
      const barWidth = canvas.width / barCount;
      const progressRatio = dur > 0 ? Math.min(1, Math.max(0, time / dur)) : 0;
      const progressIndex = Math.floor(progressRatio * barCount);
      const progressX = progressRatio * canvas.width;

      for (let i = 0; i < barCount; i++) {
        const peak = peaks[i];
        const height = Math.max(2, peak * centerY * 0.85);
        const x = i * barWidth;
        const y = centerY - height;

        if (i <= progressIndex) {
          // Played bars — full color
          ctx.fillStyle = barColor;
        } else {
          // Unplayed bars — alt color at reduced alpha
          ctx.fillStyle = hexToRgba(barAltColor, 0.35);
        }

        // Top half (above center)
        ctx.fillRect(x + 1, y, barWidth - 2, height);
        // Bottom half (below center, mirrored)
        ctx.fillRect(x + 1, centerY, barWidth - 2, height);
      }

      // Playhead line
      if (dur > 0 && progressX > 0) {
        ctx.fillStyle = glowColor;
        ctx.fillRect(progressX - 1, 0, 2, canvas.height);
      }
    }

    if (isPlaying) {
      const loop = () => {
        animationRef.current = requestAnimationFrame(loop);
        draw();
      };
      loop();
    } else {
      // Single draw when paused
      draw();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [audioElement, isPlaying, waveformPeaks]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      className="w-full h-32"
      style={{
        borderRadius: `${borderRadius ?? 8}px`,
        border: borderShow ? `1px solid ${borderColor || "#374151"}` : "none",
        mixBlendMode: (blendMode || "normal") as React.CSSProperties["mixBlendMode"],
      }}
    />
  );
}
