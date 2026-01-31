import { useEffect, useRef } from "react";
import type { PcmAnalyser } from "~/hooks/usePcmAnalyser";
import { createLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "lobby:visualizer" });

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  waveformPeaks?: number[] | null;
  borderShow?: boolean;
  borderColor?: string;
  borderRadius?: number;
  blendMode?: string;
  pcmAnalyser?: PcmAnalyser | null;
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

export function AudioVisualizer({ audioElement, isPlaying, borderShow, borderColor, borderRadius, blendMode, pcmAnalyser }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Safari (and iOS) require AudioContext.resume() to be called from a
  // user gesture handler. Register a capture-phase listener so the
  // context is resumed *before* the play-button handler fires.
  useEffect(() => {
    if (pcmAnalyser) return; // No Web Audio context when using PCM analyser
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
  }, [pcmAnalyser]);

  // Main draw effect.
  // AudioContext creation lives here (not in a separate effect) so the
  // analyser is guaranteed to exist when the draw loop starts.
  useEffect(() => {
    if (!audioElement || !canvasRef.current) return;

    // Set up the frequency data source: either PCM analyser or Web Audio AnalyserNode
    let getFrequencyData: (arr: Uint8Array<ArrayBuffer>) => void;
    let bufferLength: number;

    if (pcmAnalyser) {
      // PCM analyser — decodes HLS segments to PCM and computes FFT.
      // Used on Safari where createMediaElementSource can't capture audio
      // from MSE or native HLS sources.
      bufferLength = pcmAnalyser.frequencyBinCount;
      getFrequencyData = (arr) => pcmAnalyser.getByteFrequencyData(arr);
    } else {
      // Web Audio AnalyserNode — captures real-time frequency data.
      // Works on Chrome, Firefox, Edge where MSE sources are capturable.
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext();
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
        } catch (error) {
          logger.error("Audio context not working");
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

    // Theme colors (read once per effect run)
    const bgColor = getThemeColor(canvas, "--color-visualizer-bg", "#111827");
    const bgOpacity = parseFloat(getThemeColor(canvas, "--color-visualizer-bg-opacity", "0")) || 0;
    const barColor = getThemeColor(canvas, "--color-visualizer-bar", "#ffffff");
    const barAltColor = getThemeColor(canvas, "--color-visualizer-bar-alt", "#9ca3af");
    const glowColor = getThemeColor(canvas, "--color-visualizer-glow", "#ffffff");

    // Logarithmic frequency map (mirrored)
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

    if (isPlaying) {
      if (!pcmAnalyser && audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }

      const loop = () => {
        animationRef.current = requestAnimationFrame(loop);
        getFrequencyData(dataArray);
        drawBars(dataArray);
      };
      loop();
    } else {
      // When paused, draw the current frequency snapshot (frozen)
      getFrequencyData(dataArray);
      drawBars(dataArray);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [audioElement, isPlaying, pcmAnalyser]);

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
      role="img"
      aria-label={isPlaying ? "Audio frequency visualizer - music is playing" : "Audio frequency visualizer - paused"}
    />
  );
}
