import { useEffect, useRef } from "react";
import { createLogger } from "@secretlobby/logger/client";
import { borderRadiusToCSS, type BorderRadius } from "@secretlobby/theme";
import type { PcmAnalyser } from "./usePcmAnalyser";

const logger = createLogger({ service: "lobby:visualizer" });

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  waveformPeaks?: number[] | null;
  borderShow?: boolean;
  borderColor?: string;
  borderRadius?: BorderRadius;
  blendMode?: string;
  pcmAnalyser?: PcmAnalyser | null;
  /**
   * Demo mode: render an animated synthetic frequency pattern instead of
   * tapping the real audio element. Used in the page-builder canvas where
   * no audio actually plays so the designer can preview the visualizer
   * style with the current theme.
   */
  demoMode?: boolean;
}

function getThemeColor(element: Element | null, varName: string, fallback: string): string {
  if (typeof document === "undefined" || !element) return fallback;
  const value = getComputedStyle(element).getPropertyValue(varName).trim();
  return value || fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(255, 255, 255, ${alpha})`;
}

export function AudioVisualizer({ audioElement, isPlaying, borderShow, borderColor, borderRadius, blendMode, pcmAnalyser, demoMode }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    if (pcmAnalyser || demoMode) return;
    const resume = () => {
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
    };
    document.addEventListener("click", resume, { capture: true });
    document.addEventListener("touchstart", resume, { capture: true });
    return () => {
      document.removeEventListener("click", resume, { capture: true });
      document.removeEventListener("touchstart", resume, { capture: true });
    };
  }, [pcmAnalyser, demoMode]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!demoMode && !audioElement) return;

    let getFrequencyData: (arr: Uint8Array<ArrayBuffer>) => void;
    let bufferLength: number;

    if (demoMode) {
      // Synthesize a plausible-looking equalizer pattern so the page-builder
      // designer sees the visualizer's shape + theme colors without any
      // real audio playing. Animates while "isPlaying" is set; falls back
      // to a static idle silhouette otherwise.
      bufferLength = 128;
      const demoStart = performance.now();
      getFrequencyData = (arr) => {
        const t = (performance.now() - demoStart) / 1000;
        for (let i = 0; i < bufferLength; i++) {
          const norm = i / bufferLength;
          // Low frequencies tend to be loud; falloff toward high end.
          const falloff = Math.pow(1 - norm, 1.6);
          const wobble = isPlaying
            ? 0.5 + 0.5 * Math.sin(t * 1.4 + norm * 8 + i * 0.13)
            : 0.45;
          arr[i] = Math.max(0, Math.min(255, Math.floor(255 * falloff * wobble)));
        }
      };
    } else if (pcmAnalyser) {
      bufferLength = pcmAnalyser.frequencyBinCount;
      getFrequencyData = (arr) => pcmAnalyser.getByteFrequencyData(arr);
    } else {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext();
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement!);
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
        } catch (error) {
          logger.error({ error }, "Audio context not working");
        }
      }

      const analyser = analyserRef.current;
      if (!analyser) return;
      bufferLength = analyser.frequencyBinCount;
      getFrequencyData = (arr) => analyser.getByteFrequencyData(arr);
    }

    const canvas = canvasRef.current;
    const ctxOrNull = canvas.getContext("2d");
    if (!ctxOrNull) return;
    const ctx = ctxOrNull;

    const dataArray = new Uint8Array(bufferLength);

    const bgColor = getThemeColor(canvas, "--color-visualizer-bg", "#111827");
    const bgOpacity = parseFloat(getThemeColor(canvas, "--color-visualizer-bg-opacity", "0")) || 0;
    const barColor = getThemeColor(canvas, "--color-visualizer-bar", "#ffffff");
    const barAltColor = getThemeColor(canvas, "--color-visualizer-bar-alt", "#9ca3af");
    const glowColor = getThemeColor(canvas, "--color-visualizer-glow", "#ffffff");

    const halfBars = 32;
    const logMap: number[] = [];
    for (let i = 0; i < halfBars; i++) {
      const t = i / halfBars;
      logMap.push(Math.min(Math.floor(Math.pow(t, 1.5) * (bufferLength * 0.75)), bufferLength - 1));
    }

    const barWidth = canvas.width / (halfBars * 2);
    const centerY = canvas.height / 2;

    function clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgOpacity > 0) {
        ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function drawBars(data: Uint8Array) {
      clear();

      const gradient = ctx.createLinearGradient(0, centerY, 0, 0);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(0.6, barAltColor);
      gradient.addColorStop(1, glowColor);

      for (let i = 0; i < halfBars; i++) {
        const idx = logMap[i];
        const range = Math.max(1, Math.floor(bufferLength / halfBars / 2));
        let sum = 0;
        for (let j = 0; j < range; j++) {
          sum += data[Math.min(idx + j, bufferLength - 1)];
        }
        const value = sum / range;
        const height = (value / 255) * centerY * 0.85;

        const rightX = (halfBars + i) * barWidth;
        const leftX = (halfBars - 1 - i) * barWidth;

        ctx.fillStyle = gradient;
        ctx.fillRect(rightX + 1, centerY - height, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY - height, barWidth - 2, height);

        ctx.fillStyle = hexToRgba(barColor, 0.3);
        ctx.fillRect(rightX + 1, centerY, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY, barWidth - 2, height);

        if (value > 180) {
          ctx.fillStyle = hexToRgba(glowColor, (value / 255) * 0.2);
          ctx.fillRect(rightX + 1, centerY - height - 2, barWidth - 2, 4);
          ctx.fillRect(leftX + 1, centerY - height - 2, barWidth - 2, 4);
        }
      }
    }

    if (isPlaying || demoMode) {
      if (!pcmAnalyser && !demoMode && audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }

      const loop = () => {
        animationRef.current = requestAnimationFrame(loop);
        getFrequencyData(dataArray);
        drawBars(dataArray);
      };
      loop();
    } else {
      getFrequencyData(dataArray);
      drawBars(dataArray);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [audioElement, isPlaying, pcmAnalyser, demoMode]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      className="w-full h-32"
      style={{
        borderRadius: borderRadiusToCSS(borderRadius, 8),
        border: borderShow ? `1px solid ${borderColor || "#374151"}` : "none",
        mixBlendMode: (blendMode || "normal") as React.CSSProperties["mixBlendMode"],
      }}
      role="img"
      aria-label={isPlaying ? "Audio frequency visualizer - music is playing" : "Audio frequency visualizer - paused"}
    />
  );
}
