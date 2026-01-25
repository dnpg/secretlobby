import { useEffect, useRef, useCallback } from "react";

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

export function AudioVisualizer({ audioElement, isPlaying, currentTime = 0, duration = 0, waveformPeaks, borderShow, borderColor, borderRadius, blendMode }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const hasPlayedRef = useRef(false);
  const lastTimeRef = useRef<number>(0);
  const drawFnRef = useRef<((dataArray?: Uint8Array) => void) | null>(null);

  useEffect(() => {
    if (!audioElement || !canvasRef.current) return;

    // Only create audio context once per audio element
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Get theme colors from the canvas element (inherits CSS vars from parent wrapper)
    const bgColor = getThemeColor(canvas, "--color-visualizer-bg", "#111827");
    const bgOpacityStr = getThemeColor(canvas, "--color-visualizer-bg-opacity", "0");
    const bgOpacity = parseFloat(bgOpacityStr) || 0;
    const barColor = getThemeColor(canvas, "--color-visualizer-bar", "#ffffff");
    const barAltColor = getThemeColor(canvas, "--color-visualizer-bar-alt", "#9ca3af");
    const glowColor = getThemeColor(canvas, "--color-visualizer-glow", "#ffffff");

    // Build logarithmic frequency map for half the bars (mirrored)
    const halfBars = 32;
    const logMap: number[] = [];
    for (let i = 0; i < halfBars; i++) {
      const t = i / halfBars;
      const logIndex = Math.floor(Math.pow(t, 1.5) * (bufferLength * 0.75));
      logMap.push(Math.min(logIndex, bufferLength - 1));
    }

    const totalBars = halfBars * 2;
    const barWidth = canvas.width / totalBars;
    const centerY = canvas.height / 2;

    function clearCanvas() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgOpacity > 0) {
        ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function drawBars(data: Uint8Array) {
      if (!ctx) return;
      clearCanvas();

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

        // Upper bars (grow up from center)
        ctx.fillStyle = gradient;
        ctx.fillRect(rightX + 1, centerY - height, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY - height, barWidth - 2, height);

        // Lower bars (mirror down from center, same height for vertical centering)
        ctx.fillStyle = hexToRgba(barColor, 0.3);
        ctx.fillRect(rightX + 1, centerY, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY, barWidth - 2, height);

        // Glow on peaks
        if (value > 180) {
          ctx.fillStyle = hexToRgba(glowColor, (value / 255) * 0.2);
          ctx.fillRect(rightX + 1, centerY - height - 2, barWidth - 2, 4);
          ctx.fillRect(leftX + 1, centerY - height - 2, barWidth - 2, 4);
        }
      }
    }

    // Draw waveform from time-domain data (for paused state after seek)
    function drawWaveform(timeDomainData: Uint8Array) {
      if (!ctx) return;
      clearCanvas();

      const gradient = ctx.createLinearGradient(0, centerY, 0, 0);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(0.6, barAltColor);
      gradient.addColorStop(1, glowColor);

      // Convert time-domain data to amplitude bars
      const samplesPerBar = Math.floor(timeDomainData.length / halfBars);

      for (let i = 0; i < halfBars; i++) {
        // Calculate RMS amplitude for this bar's samples
        let sum = 0;
        for (let j = 0; j < samplesPerBar; j++) {
          const sample = (timeDomainData[i * samplesPerBar + j] - 128) / 128; // Normalize to -1 to 1
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / samplesPerBar);
        const value = Math.min(255, rms * 255 * 3); // Scale up for visibility
        const height = Math.max(3, (value / 255) * centerY * 0.85);

        const rightX = (halfBars + i) * barWidth;
        const leftX = (halfBars - 1 - i) * barWidth;

        ctx.fillStyle = gradient;
        ctx.fillRect(rightX + 1, centerY - height, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY - height, barWidth - 2, height);

        ctx.fillStyle = hexToRgba(barColor, 0.3);
        ctx.fillRect(rightX + 1, centerY, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY, barWidth - 2, height);
      }
    }

    // Expose draw function for seek updates
    drawFnRef.current = (customData?: Uint8Array) => {
      if (customData) {
        drawBars(customData);
      } else {
        analyser.getByteFrequencyData(dataArray);
        drawBars(dataArray);
      }
    };

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      drawBars(dataArray);
    };

    // Try to capture current audio state for seek visualization
    const captureAndDraw = () => {
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
      // Get time-domain data (waveform) which may have current buffer state
      const timeDomainData = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(timeDomainData);

      // Check if we have actual audio data (not just silence at 128)
      let hasData = false;
      for (let i = 0; i < timeDomainData.length; i++) {
        if (timeDomainData[i] !== 128) {
          hasData = true;
          break;
        }
      }

      if (hasData) {
        drawWaveform(timeDomainData);
      } else {
        // Fallback: get frequency data (may have residual from last play)
        analyser.getByteFrequencyData(dataArray);
        let freqHasData = false;
        for (let i = 0; i < dataArray.length; i++) {
          if (dataArray[i] > 0) {
            freqHasData = true;
            break;
          }
        }
        if (freqHasData) {
          drawBars(dataArray);
        } else {
          // No data available - draw static pattern
          drawStaticPattern();
        }
      }
    };

    function drawStaticPattern() {
      if (!ctx) return;
      clearCanvas();

      const gradient = ctx.createLinearGradient(0, centerY, 0, 0);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(0.6, barAltColor);
      gradient.addColorStop(1, glowColor);

      // Calculate starting peak index based on current time
      let startPeakIndex = 0;
      if (waveformPeaks && waveformPeaks.length > 0 && duration > 0) {
        // Map current time to peak index
        const peaksPerSecond = waveformPeaks.length / duration;
        startPeakIndex = Math.floor(currentTime * peaksPerSecond);
        // Ensure we don't go past the end
        startPeakIndex = Math.min(startPeakIndex, Math.max(0, waveformPeaks.length - halfBars));
      }

      // Collect peaks for this time window
      const windowPeaks: number[] = [];
      if (waveformPeaks && waveformPeaks.length >= halfBars && duration > 0) {
        for (let i = 0; i < halfBars; i++) {
          windowPeaks.push(waveformPeaks[startPeakIndex + i] || 0);
        }
      } else if (waveformPeaks && waveformPeaks.length >= halfBars) {
        for (let i = 0; i < halfBars; i++) {
          windowPeaks.push(waveformPeaks[i] || 0);
        }
      } else {
        // Fallback: deterministic pattern
        for (let i = 0; i < halfBars; i++) {
          windowPeaks.push(30 + Math.sin(i * 0.5) * 40 + Math.cos(i * 0.3) * 30);
        }
      }

      // Sort peaks descending so highest values are in the center (like frequency display)
      const sortedPeaks = [...windowPeaks].sort((a, b) => b - a);

      for (let i = 0; i < halfBars; i++) {
        const value = sortedPeaks[i];
        const height = Math.max(3, (value / 255) * centerY * 0.85);
        const rightX = (halfBars + i) * barWidth;
        const leftX = (halfBars - 1 - i) * barWidth;

        // Upper bars (grow up from center)
        ctx.fillStyle = gradient;
        ctx.fillRect(rightX + 1, centerY - height, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY - height, barWidth - 2, height);

        // Lower bars (mirror down from center, same height for vertical centering)
        ctx.fillStyle = hexToRgba(barColor, 0.3);
        ctx.fillRect(rightX + 1, centerY, barWidth - 2, height);
        ctx.fillRect(leftX + 1, centerY, barWidth - 2, height);

        // Glow on peaks (matching drawBars behavior)
        if (value > 180) {
          ctx.fillStyle = hexToRgba(glowColor, (value / 255) * 0.2);
          ctx.fillRect(rightX + 1, centerY - height - 2, barWidth - 2, 4);
          ctx.fillRect(leftX + 1, centerY - height - 2, barWidth - 2, 4);
        }
      }
    }

    if (isPlaying) {
      hasPlayedRef.current = true;
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }
      draw();
    } else {
      // Paused or initial state - draw using waveform peaks at current time
      drawStaticPattern();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioElement, isPlaying, waveformPeaks, duration, currentTime]);

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
