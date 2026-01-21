import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
}

function getThemeColor(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
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

export function AudioVisualizer({ audioElement, isPlaying }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

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

    // Get theme colors
    const bgColor = getThemeColor("--color-bg-secondary", "#111827");
    const barColor = getThemeColor("--color-visualizer-bar", "#ffffff");
    const barAltColor = getThemeColor("--color-visualizer-bar-alt", "#9ca3af");
    const glowColor = getThemeColor("--color-visualizer-glow", "#ffffff");

    const draw = () => {
      if (!isPlaying) {
        // Draw idle state
        ctx.fillStyle = hexToRgba(bgColor, 0.9);
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barCount = 64;
        const barWidth = canvas.width / barCount;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, barColor);
        gradient.addColorStop(1, barAltColor);

        for (let i = 0; i < barCount; i++) {
          const height = Math.random() * 20 + 5;
          ctx.fillStyle = gradient;
          ctx.fillRect(
            i * barWidth + 1,
            canvas.height - height,
            barWidth - 2,
            height
          );
        }
        return;
      }

      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = hexToRgba(bgColor, 0.9);
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barCount = 64;
      const barWidth = canvas.width / barCount;
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(0.5, barAltColor);
      gradient.addColorStop(1, glowColor);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex];
        const height = (value / 255) * canvas.height * 0.8;

        ctx.fillStyle = gradient;
        ctx.fillRect(
          i * barWidth + 1,
          canvas.height - height,
          barWidth - 2,
          height
        );

        // Mirror/glow effect
        ctx.fillStyle = hexToRgba(glowColor, (value / 255) * 0.3);
        ctx.fillRect(
          i * barWidth + 1,
          0,
          barWidth - 2,
          height * 0.3
        );
      }
    };

    if (isPlaying) {
      // Resume audio context if suspended
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }
      draw();
    } else {
      draw(); // Draw idle state once
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioElement, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      className="w-full h-32 rounded-lg"
    />
  );
}
