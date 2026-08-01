// hooks/useAudioAnalyzer.ts
// Target: Expo (React Native Web) + Next.js (browser)
// Strategy: mutable refs only — zero setState calls in the hot path to prevent re-render bottlenecks.

import { useEffect, useRef, useCallback } from 'react';

export interface AudioBands {
  bass: number;   // 0.0 – 1.0  (lower 5% of FFT bins)
  mid: number;    // 0.0 – 1.0  (5–25% of FFT bins)
  high: number;   // 0.0 – 1.0  (remaining 75% of FFT bins)
}

export interface AudioAnalyzerOptions {
  fftSize?: number;           // default: 2048
  smoothingTimeConstant?: number; // default: 0.8
  onBands?: (bands: AudioBands) => void; // optional pull-mode callback
}

export interface AudioAnalyzerHandle {
  /** Call once with your <audio> element or MediaStream to wire up the analyser. */
  connect: (source: HTMLAudioElement | MediaStream) => void;
  /** Read current band values synchronously (for WebGL uniform injection). */
  getBands: () => Readonly<AudioBands>;
  /** Stop the RAF loop and close the AudioContext. */
  dispose: () => void;
  /** Resume AudioContext if suspended (browser autoplay policy) */
  resume: () => Promise<void>;
  /** Get raw frequency data for spectrum UI */
  getByteFrequencyData: (outArray: Uint8Array) => void;
}

export function useAudioAnalyzer(options: AudioAnalyzerOptions = {}): AudioAnalyzerHandle {
  const { fftSize = 2048, smoothingTimeConstant = 0.8, onBands } = options;

  // ── Persistent refs — no setState anywhere in this hook ───────────────────
  const ctxRef        = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const dataRef       = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0) as Uint8Array<ArrayBuffer>);
  const rafRef        = useRef<number>(0);
  const bandsRef      = useRef<AudioBands>({ bass: 0, mid: 0, high: 0 });
  const connectedRef  = useRef(false);

  // ── Band splitter — inline, no allocation in loop ─────────────────────────
  const computeBands = useCallback((data: Uint8Array): AudioBands => {
    const len = data.length;
    // Band boundaries (index counts, not frequencies)
    const bassEnd  = Math.floor(len * 0.05);          // 0  –  5%
    const midEnd   = Math.floor(len * 0.25);          // 5% – 25%
    // high: midEnd – len (remaining ~75%)

    let bassSum = 0, midSum = 0, highSum = 0;

    for (let i = 0; i < bassEnd; i++)          bassSum  += data[i];
    for (let i = bassEnd; i < midEnd; i++)     midSum   += data[i];
    for (let i = midEnd;  i < len;   i++)      highSum  += data[i];

    const bassCount  = bassEnd;
    const midCount   = midEnd  - bassEnd;
    const highCount  = len     - midEnd;

    return {
      bass:  bassCount  > 0 ? bassSum  / bassCount  / 255 : 0,
      mid:   midCount   > 0 ? midSum   / midCount   / 255 : 0,
      high:  highCount  > 0 ? highSum  / highCount  / 255 : 0,
    };
  }, []);

  // ── 60fps RAF loop — runs outside React render cycle ─────────────────────
  const startLoop = useCallback(() => {
    const tick = () => {
      const analyser = analyserRef.current;
      const data     = dataRef.current;
      if (analyser && data.length > 0) {
        analyser.getByteFrequencyData(data);
        const bands       = computeBands(data);
        bandsRef.current  = bands;          // mutable write — no re-render
        onBands?.(bands);                   // optional external consumer
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [computeBands, onBands]);

  // ── connect() — called once by the consumer ───────────────────────────────
  const connect = useCallback((source: HTMLAudioElement | MediaStream) => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    try {
      // Safari / Expo Web: AudioContext must be created after a user gesture
      const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
      const ctx      = new AudioCtx();
      ctxRef.current = ctx;

      const analyser               = ctx.createAnalyser();
      analyser.fftSize             = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      analyserRef.current          = analyser;
      dataRef.current              = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

      // Accept either an HTMLAudioElement or a raw MediaStream
      const mediaSource =
        source instanceof MediaStream
          ? ctx.createMediaStreamSource(source)
          : ctx.createMediaElementSource(source as HTMLAudioElement);

      mediaSource.connect(analyser);
      // For MediaStream (microphone), do NOT connect to destination to avoid feedback echo loop!
      if (!(source instanceof MediaStream)) {
        analyser.connect(ctx.destination); // pass-through so audio plays
      }

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      startLoop();
    } catch (err) {
      console.warn('AudioAnalyzer connect warning:', err);
      connectedRef.current = false;
    }
  }, [fftSize, smoothingTimeConstant, startLoop]);

  // ── Synchronous band read — called by WebGL uniform injection ────────────
  const getBands = useCallback((): Readonly<AudioBands> => {
    return bandsRef.current;
  }, []);

  const resume = useCallback(async () => {
    if (ctxRef.current && ctxRef.current.state === 'suspended') {
      await ctxRef.current.resume();
    }
  }, []);

  const getByteFrequencyData = useCallback((outArray: Uint8Array) => {
    if (analyserRef.current && dataRef.current) {
      analyserRef.current.getByteFrequencyData(outArray as Uint8Array<ArrayBuffer>);
    }
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const dispose = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current     = null;
    analyserRef.current = null;
    connectedRef.current = false;
  }, []);

  useEffect(() => () => dispose(), [dispose]);

  return { connect, getBands, dispose, resume, getByteFrequencyData };
}
