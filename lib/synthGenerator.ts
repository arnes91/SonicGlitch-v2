// lib/synthGenerator.ts
// Web Audio API procedural synth beat engine for live visualization without external assets

export interface SynthPreset {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  description: string;
  colorHex: string;
}

export const SYNTH_PRESETS: SynthPreset[] = [
  {
    id: 'glitch_necromancer',
    name: 'Glitch Necromancer',
    genre: 'Neurofunk / Glitch',
    bpm: 172,
    description: 'Fast neuro drum patterns with heavy sub-bass pulses and bit-shifted synth leads',
    colorHex: '#ec4899',
  },
  {
    id: 'neon_sabah',
    name: 'Neon Sabah',
    genre: 'Cyberpunk Synthwave',
    bpm: 124,
    description: 'Pulsing 808 basslines, sidechained retro saw chords, and sharp metallic hats',
    colorHex: '#06b6d4',
  },
  {
    id: 'balkan_subtrap',
    name: 'Balkan Sub-Trap',
    genre: 'Glitch Trap',
    bpm: 140,
    description: 'Heavy sub-bass glides, rapid hat rolls, and ethnic glitch-synth arpeggios',
    colorHex: '#eab308',
  },
  {
    id: 'quantum_chaos',
    name: 'Quantum Chaos',
    genre: 'Dark Ambient Synth',
    bpm: 95,
    description: 'FM synth swells, deep sub drones, bitcrushed noise impacts, and spatial atmosphere',
    colorHex: '#8b5cf6',
  },
];

export class ProceduralSynthEngine {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private isPlaying = false;
  private timerId: number | null = null;
  private step = 0;
  private currentPresetId = 'glitch_necromancer';
  private masterGain: GainNode | null = null;

  public getMediaStream(): MediaStream | null {
    return this.dest ? this.dest.stream : null;
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public start(presetId: string = 'glitch_necromancer'): MediaStream | null {
    this.stop();

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx();
    
    // Create destination stream for analyzer & speakers
    this.dest = this.ctx.createMediaStreamDestination();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.dest);
    this.masterGain.connect(this.ctx.destination);

    this.currentPresetId = presetId;
    this.isPlaying = true;
    this.step = 0;

    const preset = SYNTH_PRESETS.find(p => p.id === presetId) || SYNTH_PRESETS[0];
    const stepIntervalMs = (60 / preset.bpm / 4) * 1000;

    const loop = () => {
      if (!this.isPlaying || !this.ctx) return;
      this.playStep(this.step, preset.id);
      this.step = (this.step + 1) % 32;
      this.timerId = window.setTimeout(loop, stepIntervalMs);
    };

    loop();
    return this.dest.stream;
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.dest = null;
  }

  public setVolume(val: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime, 0.05);
    }
  }

  private playStep(step: number, presetId: string) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    // Pattern logic per preset
    switch (presetId) {
      case 'glitch_necromancer': {
        // Neuro Drum & Bass
        // Kick on 0, 10, 16, 26
        if (step === 0 || step === 10 || step === 16 || step === 26) {
          this.triggerKick(t, 140, 45, 0.18);
        }
        // Snare on 8, 24
        if (step === 8 || step === 24) {
          this.triggerSnare(t, 220, 0.15);
        }
        // Hihat on odd steps
        if (step % 2 === 1) {
          this.triggerHiHat(t, 0.05, step % 4 === 3 ? 0.8 : 0.4);
        }
        // Sub-bass line
        if (step % 4 === 0) {
          const notes = [43.65, 43.65, 51.91, 38.89]; // F1, F1, Ab1, Eb1
          const note = notes[Math.floor(step / 8) % notes.length];
          this.triggerSubBass(t, note, 0.22);
        }
        // Glitch lead arp
        if (step % 2 === 0 && Math.random() > 0.2) {
          const scale = [349.23, 415.30, 466.16, 523.25, 622.25, 698.46]; // F minor pentatonic
          const freq = scale[(step * 3 + Math.floor(Math.random() * 3)) % scale.length];
          this.triggerGlitchLead(t, freq, 0.08);
        }
        break;
      }

      case 'neon_sabah': {
        // Synthwave 124 BPM
        // Four on the floor kick
        if (step % 8 === 0) {
          this.triggerKick(t, 120, 40, 0.25);
        }
        // Snare on 8, 24
        if (step === 8 || step === 24) {
          this.triggerSnare(t, 180, 0.2);
        }
        // Offbeat hats
        if (step % 4 === 2) {
          this.triggerHiHat(t, 0.08, 0.7);
        }
        // Synth pad / chord arp
        if (step % 2 === 0) {
          const synthNotes = [220, 261.63, 329.63, 392, 440, 523.25]; // Am7 chord tones
          const freq = synthNotes[(step / 2) % synthNotes.length];
          this.triggerSawLead(t, freq, 0.15);
        }
        // Sub bass pulse
        if (step % 8 === 0 || step % 8 === 4) {
          this.triggerSubBass(t, 55, 0.3); // A1
        }
        break;
      }

      case 'balkan_subtrap': {
        // Trap 140 BPM
        if (step === 0 || step === 14 || step === 16 || step === 28) {
          this.triggerKick(t, 160, 35, 0.3); // 808 Sub Kick
        }
        if (step === 8 || step === 24) {
          this.triggerSnare(t, 250, 0.18);
        }
        // Rapid Hat roll
        if (step >= 24 && step <= 31) {
          this.triggerHiHat(t, 0.03, 0.6);
        } else if (step % 2 === 0) {
          this.triggerHiHat(t, 0.05, 0.5);
        }
        // Lead melody
        if (step % 4 === 0) {
          const leadFreqs = [587.33, 523.25, 440, 392]; // D5, C5, A4, G4
          const f = leadFreqs[(step / 4) % leadFreqs.length];
          this.triggerGlitchLead(t, f, 0.14);
        }
        break;
      }

      case 'quantum_chaos': {
        // Ambient Glitch
        if (step % 16 === 0) {
          this.triggerKick(t, 80, 30, 0.4);
        }
        if (step % 8 === 4) {
          this.triggerSnare(t, 150, 0.3);
        }
        if (Math.random() > 0.6) {
          this.triggerHiHat(t, 0.1, 0.4);
        }
        if (step % 4 === 0) {
          const ambientScale = [130.81, 146.83, 164.81, 196, 220]; // C minor ambient
          const freq = ambientScale[Math.floor(Math.random() * ambientScale.length)];
          this.triggerSawLead(t, freq, 0.4);
          this.triggerSubBass(t, freq / 2, 0.5);
        }
        break;
      }
    }
  }

  // --- Sound Synthesis Modules ---
  private triggerKick(t: number, startFreq: number, endFreq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  private triggerSnare(t: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    // Tone oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration);

    // Noise buffer
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(t);
  }

  private triggerHiHat(t: number, duration: number, volume: number) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
  }

  private triggerSubBass(t: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  private triggerGlitchLead(t: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.5, t);
    filter.Q.value = 6;

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  private triggerSawLead(t: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, t + duration);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }
}
