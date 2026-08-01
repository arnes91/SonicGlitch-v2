// components/VisualizerStudio.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Mic, Upload, Music,
  Maximize2, Camera, Activity, Sparkles, Radio, Sliders, Zap
} from 'lucide-react';
import GlitchVisualizer, { GlitchVisualizerHandle } from '@/components/GlitchVisualizer';
import { useAudioAnalyzer, AudioBands } from '@/hooks/useAudioAnalyzer';
import { ProceduralSynthEngine, SYNTH_PRESETS } from '@/lib/synthGenerator';

type AudioSourceType = 'synth' | 'file' | 'mic';

export default function VisualizerStudio() {
  const [sourceType, setSourceType] = useState<AudioSourceType>('synth');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('glitch_necromancer');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  // Shader settings
  const [glitchMultiplier, setGlitchMultiplier] = useState<number>(1.2);
  const [colorMode, setColorMode] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [sensitivity, setSensitivity] = useState<number>(1.2);
  const [showSpectrumOverlay, setShowSpectrumOverlay] = useState<boolean>(true);

  // File upload state
  const [audioFileName, setAudioFileName] = useState<string | null>(null);

  // Real-time Band readout for UI meters
  const [bandsDisplay, setBandsDisplay] = useState<AudioBands>({ bass: 0, mid: 0, high: 0 });

  // Refs
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const visualizerRef = useRef<GlitchVisualizerHandle>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthEngineRef = useRef<ProceduralSynthEngine | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Audio analyzer hook instance for studio
  const analyzer = useAudioAnalyzer({
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
  });

  // Lazy init synth engine in useEffect to satisfy linter
  useEffect(() => {
    if (!synthEngineRef.current) {
      synthEngineRef.current = new ProceduralSynthEngine();
    }
  }, []);

  // Stop Microphone helper
  const stopMicrophone = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
  }, []);

  // Start Microphone helper
  const startMicrophone = useCallback(async () => {
    try {
      stopMicrophone();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      analyzer.connect(stream);
      setIsPlaying(true);
    } catch (err) {
      alert('Microphone access denied or unavailable.');
      console.error(err);
      setIsPlaying(false);
    }
  }, [analyzer, stopMicrophone]);

  // Handle Play/Pause toggle
  const togglePlay = useCallback(async () => {
    await analyzer.resume();

    if (sourceType === 'synth') {
      if (isPlaying) {
        synthEngineRef.current?.stop();
        setIsPlaying(false);
      } else {
        if (!synthEngineRef.current) {
          synthEngineRef.current = new ProceduralSynthEngine();
        }
        const stream = synthEngineRef.current.start(selectedPresetId);
        if (stream) {
          synthEngineRef.current.setVolume(isMuted ? 0 : volume);
          analyzer.connect(stream);
          setIsPlaying(true);
        }
      }
    } else if (sourceType === 'file') {
      if (audioElRef.current) {
        if (isPlaying) {
          audioElRef.current.pause();
          setIsPlaying(false);
        } else {
          try {
            audioElRef.current.volume = isMuted ? 0 : volume;
            await audioElRef.current.play();
            analyzer.connect(audioElRef.current);
            setIsPlaying(true);
          } catch (err) {
            console.error('Failed to play audio file:', err);
          }
        }
      }
    } else if (sourceType === 'mic') {
      if (isPlaying) {
        stopMicrophone();
        setIsPlaying(false);
      } else {
        startMicrophone();
      }
    }
  }, [isPlaying, sourceType, selectedPresetId, volume, isMuted, analyzer, startMicrophone, stopMicrophone]);

  // Switch Audio Source
  const changeSource = (type: AudioSourceType) => {
    if (isPlaying) {
      if (sourceType === 'synth') synthEngineRef.current?.stop();
      if (sourceType === 'file' && audioElRef.current) audioElRef.current.pause();
      if (sourceType === 'mic') stopMicrophone();
      setIsPlaying(false);
    }
    setSourceType(type);
  };

  // Handle Synth Preset Select
  const selectPreset = (id: string) => {
    setSelectedPresetId(id);
    if (sourceType === 'synth' && isPlaying) {
      synthEngineRef.current?.stop();
      if (!synthEngineRef.current) {
        synthEngineRef.current = new ProceduralSynthEngine();
      }
      const stream = synthEngineRef.current.start(id);
      if (stream) {
        synthEngineRef.current.setVolume(isMuted ? 0 : volume);
        analyzer.connect(stream);
      }
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setAudioFileName(file.name);

    if (audioElRef.current) {
      audioElRef.current.src = url;
      changeSource('file');
    }
  };

  // Volume Change
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (sourceType === 'synth' && synthEngineRef.current) {
      synthEngineRef.current.setVolume(newVol);
    }
    if (sourceType === 'file' && audioElRef.current) {
      audioElRef.current.volume = newVol;
    }
  };

  // Snapshot Exporter
  const handleSnapshot = () => {
    const dataUrl = visualizerRef.current?.takeSnapshot();
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.download = `glitch-visualizer-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  // Fullscreen Canvas
  const handleFullscreen = () => {
    const canvas = visualizerRef.current?.getCanvas();
    if (canvas) {
      if (canvas.requestFullscreen) {
        canvas.requestFullscreen();
      }
    }
  };

  // Spectrum overlay loop & band metrics UI polling
  useEffect(() => {
    let animId: number;
    const spectrumData = new Uint8Array(64);

    const updateMeters = () => {
      const bands = analyzer.getBands();
      setBandsDisplay(bands);

      if (showSpectrumOverlay && spectrumCanvasRef.current) {
        const ctx = spectrumCanvasRef.current.getContext('2d');
        if (ctx) {
          analyzer.getByteFrequencyData(spectrumData);
          const w = spectrumCanvasRef.current.width;
          const h = spectrumCanvasRef.current.height;

          ctx.clearRect(0, 0, w, h);
          const barWidth = w / spectrumData.length;

          for (let i = 0; i < spectrumData.length; i++) {
            const val = spectrumData[i] / 255;
            const barH = val * h;
            const x = i * barWidth;

            let color = '#ec4899';
            if (colorMode === 1) color = '#06b6d4';
            if (colorMode === 2) color = '#22c55e';
            if (colorMode === 3) color = '#e4e4e7';
            if (colorMode === 4) color = '#eab308';

            ctx.fillStyle = color;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(x, h - barH, barWidth - 1, barH);
          }
        }
      }

      animId = requestAnimationFrame(updateMeters);
    };

    animId = requestAnimationFrame(updateMeters);
    return () => cancelAnimationFrame(animId);
  }, [analyzer, showSpectrumOverlay, colorMode]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      synthEngineRef.current?.stop();
      stopMicrophone();
    };
  }, [stopMicrophone]);

  return (
    <div className="w-full min-h-screen bg-[#050505] text-[#D1D1D1] font-sans flex flex-col justify-between selection:bg-[#FF0055] selection:text-white">
      
      {/* Top Header Navigation */}
      <header className="h-14 border-b border-[#222] flex items-center justify-between px-4 sm:px-6 bg-[#0A0A0A] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-to-tr from-[#FF0055] to-[#00E0FF] rounded-sm rotate-45 flex items-center justify-center shadow-[0_0_12px_rgba(255,0,85,0.4)]">
            <div className="w-3 h-3 bg-[#0A0A0A] rounded-full"></div>
          </div>
          <span className="font-mono font-bold tracking-tighter text-base sm:text-lg uppercase text-white">
            SONICGLITCH.V2
          </span>
          <span className="hidden sm:inline-block text-[10px] bg-[#141414] text-[#888] px-2 py-0.5 rounded border border-[#333] tracking-widest uppercase font-mono">
            ELEGANT DARK • 60FPS
          </span>
        </div>

        {/* Status Signals */}
        <div className="flex items-center gap-4 sm:gap-6 text-[10px] sm:text-[11px] font-mono tracking-widest text-[#777]">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-[#00FF00] shadow-[0_0_8px_#00FF00]' : 'bg-[#444]'}`} />
            <span className="hidden md:inline">ENGINE: </span>
            <span className={isPlaying ? 'text-[#00FF00]' : 'text-[#666]'}>
              {isPlaying ? 'WEBGL_ACTIVE' : 'STANDBY'}
            </span>
          </div>
          <div className="hidden lg:block">LATENCY: 12.4ms</div>
          <div className="hidden lg:block">FFT: 2048 BINS</div>
        </div>
      </header>

      {/* Audio Source Selector Sub-Bar */}
      <div className="border-b border-[#1c1c1c] bg-[#070707] px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#555]">
            Audio Input Mode:
          </span>
          <div className="flex items-center p-0.5 bg-[#0D0D0D] border border-[#222] rounded-md">
            <button
              onClick={() => changeSource('synth')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-all ${
                sourceType === 'synth'
                  ? 'bg-[#181818] text-[#00E0FF] border border-[#333] font-bold shadow-[0_0_8px_rgba(0,224,255,0.2)]'
                  : 'text-[#777] hover:text-[#bbb]'
              }`}
            >
              <Zap className="w-3 h-3 text-[#00E0FF]" />
              Synth Engine
            </button>

            <button
              onClick={() => changeSource('file')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-all ${
                sourceType === 'file'
                  ? 'bg-[#181818] text-[#FF00E0] border border-[#333] font-bold shadow-[0_0_8px_rgba(255,0,224,0.2)]'
                  : 'text-[#777] hover:text-[#bbb]'
              }`}
            >
              <Upload className="w-3 h-3 text-[#FF00E0]" />
              Audio File
            </button>

            <button
              onClick={() => changeSource('mic')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-all ${
                sourceType === 'mic'
                  ? 'bg-[#181818] text-[#FFD700] border border-[#333] font-bold shadow-[0_0_8px_rgba(255,215,0,0.2)]'
                  : 'text-[#777] hover:text-[#bbb]'
              }`}
            >
              <Mic className="w-3 h-3 text-[#FFD700]" />
              Live Mic
            </button>
          </div>
        </div>

        {/* Source info indicator */}
        <div className="text-[11px] font-mono text-[#888] flex items-center gap-2">
          {sourceType === 'synth' && (
            <>
              <span className="text-[#555]">TRACK:</span>
              <span className="text-[#00E0FF]">
                {SYNTH_PRESETS.find(p => p.id === selectedPresetId)?.name}
              </span>
            </>
          )}
          {sourceType === 'file' && (
            <>
              <span className="text-[#555]">FILE:</span>
              <span className="text-[#FF00E0] max-w-[160px] truncate inline-block">
                {audioFileName || 'No file loaded'}
              </span>
            </>
          )}
          {sourceType === 'mic' && (
            <>
              <span className="text-[#555]">SOURCE:</span>
              <span className="text-[#FFD700]">System Microphone (Live)</span>
            </>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Sidebar Controls */}
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-[#222] bg-[#080808] p-5 flex flex-col gap-6 shrink-0 overflow-y-auto">
          
          {/* Frequency Bands Readout */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-[0.2em] font-mono">
                Frequency Bands (FFT)
              </h3>
              <span className="text-[9px] font-mono text-[#444] border border-[#1a1a1a] px-1.5 py-0.5 rounded">
                REALTIME
              </span>
            </div>

            <div className="space-y-3.5">
              {/* BASS */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-[#777]">BASS (0-5%)</span>
                  <span className="text-[#00E0FF] font-bold">
                    {(bandsDisplay.bass * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#141414] rounded-full overflow-hidden p-0 border border-[#222]">
                  <div
                    className="h-full bg-[#00E0FF] rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(0,224,255,0.5)]"
                    style={{ width: `${Math.min(100, Math.max(0, bandsDisplay.bass * 100))}%` }}
                  />
                </div>
              </div>

              {/* MID */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-[#777]">MID (5-25%)</span>
                  <span className="text-[#FF00E0] font-bold">
                    {(bandsDisplay.mid * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#141414] rounded-full overflow-hidden p-0 border border-[#222]">
                  <div
                    className="h-full bg-[#FF00E0] rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(255,0,224,0.5)]"
                    style={{ width: `${Math.min(100, Math.max(0, bandsDisplay.mid * 100))}%` }}
                  />
                </div>
              </div>

              {/* HIGH */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-[#777]">HIGH (25%+)</span>
                  <span className="text-[#FFD700] font-bold">
                    {(bandsDisplay.high * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#141414] rounded-full overflow-hidden p-0 border border-[#222]">
                  <div
                    className="h-full bg-[#FFD700] rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(255,215,0,0.5)]"
                    style={{ width: `${Math.min(100, Math.max(0, bandsDisplay.high * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Visualizer Shader Parameters */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-[0.2em] font-mono">
              Visualizer Parameters
            </h3>

            <div className="grid gap-3">
              {/* Glitch Intensity */}
              <div className="p-3 bg-[#111] border border-[#222] rounded-md space-y-2">
                <div className="flex justify-between items-center text-[9px] font-mono text-[#777] uppercase">
                  <span>Glitch Displacement</span>
                  <span className="text-[#00E0FF] font-bold text-xs">{glitchMultiplier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="3.0"
                  step="0.1"
                  value={glitchMultiplier}
                  onChange={(e) => setGlitchMultiplier(parseFloat(e.target.value))}
                  className="w-full accent-[#00E0FF] bg-[#222] h-1 rounded cursor-pointer"
                />
              </div>

              {/* Audio Sensitivity */}
              <div className="p-3 bg-[#111] border border-[#222] rounded-md space-y-2">
                <div className="flex justify-between items-center text-[9px] font-mono text-[#777] uppercase">
                  <span>Sensitivity Response</span>
                  <span className="text-[#FF00E0] font-bold text-xs">{sensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-[#FF00E0] bg-[#222] h-1 rounded cursor-pointer"
                />
              </div>

              {/* Color Palette Selector */}
              <div className="p-3 bg-[#111] border border-[#222] rounded-md space-y-2">
                <label className="block text-[9px] font-mono text-[#777] uppercase">
                  WebGL Color Palette
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 0, label: 'Default Pink', accent: 'text-[#FF0055]' },
                    { id: 1, label: 'Cyber Cyan', accent: 'text-[#00E0FF]' },
                    { id: 2, label: 'Toxic Matrix', accent: 'text-[#00FF00]' },
                    { id: 3, label: 'Monochrome', accent: 'text-[#FFFFFF]' },
                    { id: 4, label: 'Gold Sovereign', accent: 'text-[#FFD700]' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setColorMode(p.id as any)}
                      className={`px-2 py-1.5 rounded text-[10px] font-mono text-left border transition-all ${
                        colorMode === p.id
                          ? `bg-[#1c1c1c] border-[#444] ${p.accent} font-bold`
                          : 'bg-[#0d0d0d] border-[#1f1f1f] text-[#666] hover:text-[#aaa]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Oscilloscope Toggle */}
              <div className="p-3 bg-[#111] border border-[#222] rounded-md flex items-center justify-between">
                <span className="text-[9px] font-mono text-[#777] uppercase">
                  Spectrum Oscilloscope
                </span>
                <button
                  onClick={() => setShowSpectrumOverlay(!showSpectrumOverlay)}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-all ${
                    showSpectrumOverlay
                      ? 'bg-[#1a0a20] text-[#FF00E0] border-[#FF00E0]/40'
                      : 'bg-[#0d0d0d] text-[#555] border-[#222]'
                  }`}
                >
                  {showSpectrumOverlay ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>

          {/* Preset / Upload Panel */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-[0.2em] font-mono">
              {sourceType === 'synth' && 'Procedural Track Presets'}
              {sourceType === 'file' && 'Audio File Upload'}
              {sourceType === 'mic' && 'Live Input Monitor'}
            </h3>

            {sourceType === 'synth' && (
              <div className="space-y-2">
                {SYNTH_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => selectPreset(preset.id)}
                    className={`w-full text-left p-2.5 rounded border transition-all ${
                      selectedPresetId === preset.id
                        ? 'bg-[#141414] border-[#00E0FF]/60 text-white shadow-[0_0_10px_rgba(0,224,255,0.1)]'
                        : 'bg-[#0d0d0d] border-[#1c1c1c] text-[#888] hover:border-[#333] hover:text-[#ccc]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-bold">{preset.name}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#1f1f1f] text-[#00E0FF] border border-[#333]">
                        {preset.bpm} BPM
                      </span>
                    </div>
                    <p className="text-[10px] text-[#666] line-clamp-1 font-sans">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {sourceType === 'file' && (
              <label className="flex flex-col items-center justify-center p-6 border border-dashed border-[#333] hover:border-[#FF00E0] rounded-md cursor-pointer bg-[#0d0d0d] hover:bg-[#121212] transition-all text-center">
                <Upload className="w-6 h-6 text-[#FF00E0] mb-2" />
                <span className="text-xs font-mono text-white mb-1">Upload Audio File</span>
                <span className="text-[10px] text-[#555] font-mono">MP3, WAV, OGG, FLAC</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}

            {sourceType === 'mic' && (
              <div className="p-4 border border-[#222] bg-[#0d0d0d] rounded-md text-xs text-[#888] space-y-2 font-mono">
                <p className="text-white font-bold">🎤 Live Microphone Active</p>
                <p className="text-[11px] text-[#666]">
                  Microphone signal feeds directly into FFT band analyzer and WebGL fragment shaders in real-time.
                </p>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4">
            <div className="p-3 border border-dashed border-[#222] text-center rounded opacity-60">
              <p className="text-[9px] uppercase font-mono tracking-tighter text-[#666]">
                Hook Status: ACTIVE<br />Ref: useAudioAnalyzer
              </p>
            </div>
          </div>
        </aside>

        {/* Main Visualizer Stage */}
        <main className="flex-1 bg-[#000] relative p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center overflow-hidden">
          
          {/* Simulated WebGL Canvas Container */}
          <div className="w-full h-full max-h-[780px] rounded-xl overflow-hidden border border-[#222] relative group shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col justify-between">
            
            {/* Hidden HTML Audio Element for File playback */}
            <audio
              ref={audioElRef}
              className="hidden"
              onEnded={() => setIsPlaying(false)}
            />

            {/* WebGL Canvas Component */}
            <GlitchVisualizer
              ref={visualizerRef}
              analyzerHandle={analyzer}
              width={1280}
              height={720}
              glitchMultiplier={glitchMultiplier}
              colorMode={colorMode}
              sensitivity={sensitivity}
            />

            {/* Spectrum Overlay */}
            {showSpectrumOverlay && (
              <div className="absolute bottom-3 left-3 right-3 h-10 pointer-events-none rounded bg-[#0A0A0A]/80 backdrop-blur-sm border border-[#222] p-1 flex items-center justify-between z-10">
                <canvas
                  ref={spectrumCanvasRef}
                  width={400}
                  height={32}
                  className="w-full h-full block"
                />
              </div>
            )}

            {/* Canvas Action Controls Overlay */}
            <div className="absolute top-4 right-4 flex items-center gap-2 opacity-90 transition-opacity z-10">
              <button
                onClick={handleSnapshot}
                title="Capture PNG Frame"
                className="p-2 rounded bg-[#0A0A0A]/90 hover:bg-[#1a1a1a] border border-[#333] text-white transition-colors shadow-lg"
              >
                <Camera className="w-4 h-4" />
              </button>

              <button
                onClick={handleFullscreen}
                title="Toggle Fullscreen"
                className="p-2 rounded bg-[#0A0A0A]/90 hover:bg-[#1a1a1a] border border-[#333] text-white transition-colors shadow-lg"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Top Left Canvas HUD Readout */}
            <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none z-10">
              <span className="text-3xl sm:text-5xl font-mono font-black text-white/10 leading-none select-none">
                124 BPM
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-[#00E0FF] tracking-[0.3em] uppercase">
                {isPlaying ? 'Sync Signal Locked' : 'Signal Awaiting Trigger'}
              </span>
            </div>

            {/* Scanlines Effect Overlay */}
            <div
              className="absolute inset-0 pointer-events-none opacity-40 z-0"
              style={{
                background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.35) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.04), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.04))',
                backgroundSize: '100% 4px, 3px 100%'
              }}
            />
          </div>
        </main>
      </div>

      {/* Bottom Transport Footer Bar */}
      <footer className="h-20 bg-[#0A0A0A] border-t border-[#222] flex items-center px-4 sm:px-8 justify-between shrink-0">
        
        {/* Track / Play Control Section */}
        <div className="flex items-center gap-4 w-auto sm:w-1/3">
          <button
            onClick={togglePlay}
            className="w-10 h-10 border border-[#444] hover:border-white rounded-full flex items-center justify-center bg-[#111] hover:bg-[#1f1f1f] transition-all shadow-md shrink-0"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-white" />
            ) : (
              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[9px] border-l-white border-b-[5px] border-b-transparent ml-0.5" />
            )}
          </button>

          <div className="flex flex-col truncate">
            <span className="text-xs font-bold text-white font-mono truncate">
              {sourceType === 'synth' && (SYNTH_PRESETS.find(p => p.id === selectedPresetId)?.name || 'Procedural Synth')}
              {sourceType === 'file' && (audioFileName || 'No Audio File')}
              {sourceType === 'mic' && 'Live Microphone Feed'}
            </span>
            <span className="text-[10px] text-[#666] font-mono">
              {isPlaying ? 'STATUS: PLAYING' : 'STATUS: PAUSED'}
            </span>
          </div>
        </div>

        {/* Center Progress / Volume timeline */}
        <div className="hidden md:flex flex-1 items-center px-8 max-w-xl">
          <div className="w-full flex items-center gap-3">
            <button
              onClick={() => handleVolumeChange(isMuted ? 0.8 : 0)}
              className="text-[#666] hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-[#00E0FF] bg-[#1a1a1a] h-1 rounded cursor-pointer"
            />
            <span className="text-[10px] font-mono text-[#666] w-8">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>
        </div>

        {/* Right Output Graphic */}
        <div className="w-auto sm:w-1/3 flex justify-end items-center gap-3">
          <div className="flex gap-1 items-end h-5">
            <div className={`w-1 bg-[#333] transition-all ${isPlaying ? 'h-[40%] bg-[#00E0FF]' : 'h-[20%]'}`} />
            <div className={`w-1 bg-[#333] transition-all ${isPlaying ? 'h-[80%] bg-[#00E0FF]' : 'h-[30%]'}`} />
            <div className={`w-1 bg-[#333] transition-all ${isPlaying ? 'h-[100%] bg-[#FF00E0]' : 'h-[40%]'}`} />
            <div className={`w-1 bg-[#333] transition-all ${isPlaying ? 'h-[60%] bg-[#FF00E0]' : 'h-[20%]'}`} />
            <div className={`w-1 bg-[#333] transition-all ${isPlaying ? 'h-[90%] bg-[#FFD700]' : 'h-[50%]'}`} />
          </div>
          <span className="text-[10px] font-mono text-[#666] uppercase hidden sm:inline">
            Stereo Out
          </span>
        </div>
      </footer>
    </div>
  );
}
