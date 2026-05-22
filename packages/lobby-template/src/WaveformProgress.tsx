import { useEffect, useRef } from "react";
import { borderRadiusToCSS, type BorderRadius } from "@secretlobby/theme";

interface WaveformProgressProps {
  waveformPeaks: number[] | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  audioElement?: HTMLAudioElement | null;
  borderShow?: boolean;
  borderColor?: string;
  borderRadius?: BorderRadius;
  blendMode?: string;
  /** Override the canvas sizing classes. Defaults to `w-full h-32`. The
   *  compact / minimal player variants pass `w-full h-full` so the canvas
   *  fills their reduced-height wrappers. */
  className?: string;
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
  className = "w-full h-32",
}: WaveformProgressProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const peaksRef = useRef(waveformPeaks);

  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  peaksRef.current = waveformPeaks;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Captured locally so the rAF closure doesn't have to re-narrow null.
    const localCanvas = canvas;

    const ctxOrNull = localCanvas.getContext("2d");
    if (!ctxOrNull) return;
    const ctx = ctxOrNull;

    const bgColor = getThemeColor(canvas, "--color-visualizer-bg", "#111827");
    const bgOpacity = parseFloat(getThemeColor(canvas, "--color-visualizer-bg-opacity", "0")) || 0;
    const barColor = getThemeColor(canvas, "--color-visualizer-bar", "#ffffff");
    const barAltColor = getThemeColor(canvas, "--color-visualizer-bar-alt", "#9ca3af");
    const glowColor = getThemeColor(canvas, "--color-visualizer-glow", "#ffffff");

    const centerY = localCanvas.height / 2;

    function draw() {
      const peaks = peaksRef.current;
      const dur = durationRef.current;
      const time = audioElement && isPlaying ? audioElement.currentTime : currentTimeRef.current;

      ctx.clearRect(0, 0, localCanvas.width, localCanvas.height);
      if (bgOpacity > 0) {
        ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
        ctx.fillRect(0, 0, localCanvas.width, localCanvas.height);
      }

      if (!peaks || peaks.length === 0) return;

      const barCount = peaks.length;
      const barWidth = localCanvas.width / barCount;
      const progressRatio = dur > 0 ? Math.min(1, Math.max(0, time / dur)) : 0;
      const progressIndex = Math.floor(progressRatio * barCount);
      const progressX = progressRatio * localCanvas.width;

      for (let i = 0; i < barCount; i++) {
        const peak = peaks[i];
        const height = Math.max(2, peak * centerY * 0.85);
        const x = i * barWidth;
        const y = centerY - height;

        if (i <= progressIndex) {
          ctx.fillStyle = barColor;
        } else {
          ctx.fillStyle = hexToRgba(barAltColor, 0.35);
        }

        ctx.fillRect(x + 1, y, barWidth - 2, height);
        ctx.fillRect(x + 1, centerY, barWidth - 2, height);
      }

      if (dur > 0 && progressX > 0) {
        ctx.fillStyle = glowColor;
        ctx.fillRect(progressX - 1, 0, 2, localCanvas.height);
      }
    }

    if (isPlaying) {
      const loop = () => {
        animationRef.current = requestAnimationFrame(loop);
        draw();
      };
      loop();
    } else {
      draw();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [audioElement, isPlaying, waveformPeaks]);

  const progressPercent = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      className={className}
      style={{
        borderRadius: borderRadiusToCSS(borderRadius, 8),
        border: borderShow ? `1px solid ${borderColor || "#374151"}` : "none",
        mixBlendMode: (blendMode || "normal") as React.CSSProperties["mixBlendMode"],
      }}
      role="img"
      aria-label={`Audio waveform visualization - ${progressPercent}% complete${isPlaying ? ", playing" : ", paused"}`}
    />
  );
}
