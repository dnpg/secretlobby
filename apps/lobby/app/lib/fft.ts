/**
 * Radix-2 Cooley-Tukey FFT (in-place).
 * Input arrays must have power-of-2 length.
 */
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      let tmp = real[i];
      real[i] = real[j];
      real[j] = tmp;
      tmp = imag[i];
      imag[i] = imag[j];
      imag[j] = tmp;
    }
  }

  // Cooley-Tukey butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wR = Math.cos(angle);
    const wI = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;
        const tR = real[b] * curR - imag[b] * curI;
        const tI = real[b] * curI + imag[b] * curR;
        real[b] = real[a] - tR;
        imag[b] = imag[a] - tI;
        real[a] += tR;
        imag[a] += tI;
        const nextR = curR * wR - curI * wI;
        curI = curR * wI + curI * wR;
        curR = nextR;
      }
    }
  }
}

/**
 * Compute byte frequency data from PCM samples, matching
 * AnalyserNode.getByteFrequencyData() output format.
 *
 * Applies a Blackman window, runs FFT, converts magnitudes to dB,
 * then maps to 0–255 using the same scale as Web Audio
 * (minDecibels = -100, maxDecibels = -30).
 */
export function computeByteFrequencyData(
  samples: Float32Array,
  offset: number,
  fftSize: number,
  output: Uint8Array,
): void {
  const n = fftSize;
  const halfN = n >> 1;

  // Copy samples and apply Blackman window
  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  const a0 = 0.42;
  const a1 = 0.5;
  const a2 = 0.08;
  const nm1 = n - 1;

  for (let i = 0; i < n; i++) {
    const idx = offset + i;
    const sample = idx >= 0 && idx < samples.length ? samples[idx] : 0;
    const w =
      a0 -
      a1 * Math.cos((2 * Math.PI * i) / nm1) +
      a2 * Math.cos((4 * Math.PI * i) / nm1);
    real[i] = sample * w;
  }

  fft(real, imag);

  // Convert to byte frequency data (matching AnalyserNode)
  const minDecibels = -100;
  const maxDecibels = -30;
  const rangeDb = maxDecibels - minDecibels;

  for (let i = 0; i < halfN; i++) {
    const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
    const db = magnitude > 0 ? 20 * Math.log10(magnitude) : -Infinity;
    const normalized = (db - minDecibels) / rangeDb;
    output[i] = Math.max(0, Math.min(255, Math.round(normalized * 255)));
  }
}
