import type { AppTheme } from '@/hooks/useTheme';
import type { BiomeId } from './worldTypes';

export type AmbientAccentStyle =
  | 'town_birds'
  | 'town_crickets'
  | 'sakura_chime'
  | 'library_celesta'
  | 'starlight_crystal'
  | 'boss_brazier';

export interface BiomeSoundscapeProfile {
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ: number;
  noiseGain: number;
  lfoRate: number;
  lfoDepth: number;
  padFreq1: number;
  padFreq2: number;
  padCutoff: number;
  padGain: number;
  accentStyle: AmbientAccentStyle;
  accentMinMs: number;
  accentMaxMs: number;
  footstepFreq: number;
  footstepQ: number;
}

export interface AmbientAudioEngine {
  isEnabled: () => boolean;
  isPaused: () => boolean;
  setEnabled: (enabled: boolean) => void;
  setPaused: (paused: boolean) => void;
  setEnvironment: (biomeId: BiomeId, theme: AppTheme, inBossRoom: boolean) => void;
  stepFootstep: (dt: number, speed: number, isRunning: boolean) => void;
  dispose: () => void;
}

interface AudioGraph {
  ctx: AudioContext;
  noiseBuffer: AudioBuffer;
  masterGain: GainNode;
  noiseSrc: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  noiseGain: GainNode;
  lfoOsc: OscillatorNode;
  lfoGain: GainNode;
  padOsc1: OscillatorNode;
  padOsc2: OscillatorNode;
  padFilter: BiquadFilterNode;
  padGain: GainNode;
}

const MASTER_ACTIVE_GAIN = 0.62;
const WALK_STEP_INTERVAL_SEC = 0.44;
const RUN_STEP_INTERVAL_SEC = 0.29;
const NOISE_BUFFER_SEC = 4;

const SAKURA_NOTES = [587.33, 659.25, 783.99, 880.0, 987.77, 1174.66];
const CELESTA_NOTES = [349.23, 440.0, 523.25, 659.25, 783.99];
const STARLIGHT_NOTES = [659.25, 830.61, 987.77, 1318.51, 1479.98];

/**
 * Pure soundscape parameters for every Aincrad Biome × Day/Night theme + enclosed Boss Arena.
 * Tuned gently so ambient sound stays soothing while reading or strolling.
 */
export function getBiomeSoundscapeProfile(
  biomeId: BiomeId,
  theme: AppTheme,
  inBossRoom: boolean,
): BiomeSoundscapeProfile {
  if (inBossRoom) {
    return {
      filterType: 'lowpass', filterFreq: 145, filterQ: 0.9, noiseGain: 0.12,
      lfoRate: 0.08, lfoDepth: 32, padFreq1: 55.0, padFreq2: 82.41, padCutoff: 210, padGain: 0.028,
      accentStyle: 'boss_brazier', accentMinMs: 4200, accentMaxMs: 7600, footstepFreq: 760, footstepQ: 1.4,
    };
  }
  const isNight = theme === 'midnight';
  const isDim = theme === 'dim';

  if (biomeId === 'sakura_shrine') {
    return {
      filterType: isNight ? 'lowpass' : 'bandpass',
      filterFreq: isNight ? 350 : isDim ? 540 : 650,
      filterQ: isNight ? 0.65 : 0.72,
      noiseGain: isNight ? 0.065 : 0.085,
      lfoRate: 0.11, lfoDepth: isNight ? 70 : 135,
      padFreq1: 146.83, padFreq2: 220.0, padCutoff: isNight ? 260 : 340, padGain: 0.02,
      accentStyle: 'sakura_chime', accentMinMs: 5200, accentMaxMs: 9200, footstepFreq: 430, footstepQ: 0.9,
    };
  }
  if (biomeId === 'starfield_atrium') {
    return {
      filterType: 'lowpass', filterFreq: isNight ? 220 : 275, filterQ: 0.55, noiseGain: 0.045,
      lfoRate: 0.07, lfoDepth: 40,
      padFreq1: 174.61, padFreq2: 261.63, padCutoff: isNight ? 270 : 340, padGain: isNight ? 0.02 : 0.025,
      accentStyle: 'library_celesta', accentMinMs: 6000, accentMaxMs: 10500, footstepFreq: 540, footstepQ: 1.1,
    };
  }
  if (biomeId === 'starlight_ruins') {
    return {
      filterType: 'bandpass', filterFreq: isNight ? 460 : 520, filterQ: 0.85, noiseGain: 0.075,
      lfoRate: 0.09, lfoDepth: 115,
      padFreq1: 164.81, padFreq2: 246.94, padCutoff: 320, padGain: 0.024,
      accentStyle: 'starlight_crystal', accentMinMs: 4800, accentMaxMs: 8800, footstepFreq: 800, footstepQ: 1.5,
    };
  }
  return {
    filterType: 'lowpass',
    filterFreq: isNight ? 300 : isDim ? 410 : 530,
    filterQ: 0.65,
    noiseGain: isNight ? 0.055 : isDim ? 0.068 : 0.078,
    lfoRate: 0.13, lfoDepth: isNight ? 55 : 120,
    padFreq1: 130.81, padFreq2: 196.0, padCutoff: isNight ? 240 : 320, padGain: 0.018,
    accentStyle: isNight ? 'town_crickets' : 'town_birds',
    accentMinMs: isNight ? 4200 : 5400,
    accentMaxMs: isNight ? 7800 : 9800,
    footstepFreq: 740, footstepQ: 1.35,
  };
}

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/** Generates a warm stereo pink-noise buffer (Paul Kellet filter) with zero harsh hiss. */
function createPinkNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SEC));
  const buffer = ctx.createBuffer(2, frameCount, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const out = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < frameCount; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
      b6 = white * 0.115926;
    }
  }
  return buffer;
}

function scheduleToneBurst(
  ctx: AudioContext,
  dest: AudioNode,
  freqStart: number,
  freqEnd: number,
  type: OscillatorType,
  peakGain: number,
  attackSec: number,
  decaySec: number,
  delaySec = 0,
): void {
  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + attackSec + decaySec);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + attackSec);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attackSec + decaySec);
  osc.connect(gain);
  gain.connect(dest);
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignore already disconnected nodes on rapid dispose
    }
  };
  osc.start(now);
  osc.stop(now + attackSec + decaySec + 0.04);
}

function buildAudioGraph(profile: BiomeSoundscapeProfile): AudioGraph | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const noiseBuffer = createPinkNoiseBuffer(ctx);
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    const lfoOsc = ctx.createOscillator();
    lfoOsc.type = 'sine';
    const lfoGain = ctx.createGain();
    lfoOsc.connect(lfoGain);
    lfoGain.connect(noiseFilter.frequency);

    const padOsc1 = ctx.createOscillator();
    padOsc1.type = 'sine';
    const padOsc2 = ctx.createOscillator();
    padOsc2.type = 'triangle';
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    const padGain = ctx.createGain();
    padOsc1.connect(padFilter);
    padOsc2.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(masterGain);

    const graph: AudioGraph = {
      ctx, noiseBuffer, masterGain, noiseSrc, noiseFilter, noiseGain,
      lfoOsc, lfoGain, padOsc1, padOsc2, padFilter, padGain,
    };
    applyGraphProfile(graph, profile, true);
    noiseSrc.start();
    lfoOsc.start();
    padOsc1.start();
    padOsc2.start();
    return graph;
  } catch {
    return null;
  }
}

function applyGraphProfile(graph: AudioGraph, profile: BiomeSoundscapeProfile, immediate: boolean): void {
  const now = graph.ctx.currentTime;
  const tau = immediate ? 0.02 : 0.35;
  graph.noiseFilter.type = profile.filterType;
  graph.noiseFilter.frequency.setTargetAtTime(profile.filterFreq, now, tau);
  graph.noiseFilter.Q.setTargetAtTime(profile.filterQ, now, tau);
  graph.noiseGain.gain.setTargetAtTime(profile.noiseGain, now, tau);
  graph.lfoOsc.frequency.setTargetAtTime(profile.lfoRate, now, tau);
  graph.lfoGain.gain.setTargetAtTime(profile.lfoDepth, now, tau);
  graph.padOsc1.frequency.setTargetAtTime(profile.padFreq1, now, tau);
  graph.padOsc2.frequency.setTargetAtTime(profile.padFreq2, now, tau);
  graph.padFilter.frequency.setTargetAtTime(profile.padCutoff, now, tau);
  graph.padGain.gain.setTargetAtTime(profile.padGain, now, tau);
}

function playAccentForProfile(graph: AudioGraph, profile: BiomeSoundscapeProfile): void {
  const { ctx, masterGain } = graph;
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
  if (profile.accentStyle === 'town_birds') {
    const base = 1750 + Math.random() * 550;
    scheduleToneBurst(ctx, masterGain, base, base * 1.24, 'sine', 0.011, 0.03, 0.14, 0);
    scheduleToneBurst(ctx, masterGain, base * 1.18, base * 0.94, 'sine', 0.009, 0.025, 0.16, 0.17);
  } else if (profile.accentStyle === 'town_crickets') {
    const base = 3900 + Math.random() * 450;
    scheduleToneBurst(ctx, masterGain, base, base, 'sine', 0.0055, 0.015, 0.07, 0);
    scheduleToneBurst(ctx, masterGain, base, base, 'sine', 0.005, 0.015, 0.07, 0.11);
    scheduleToneBurst(ctx, masterGain, base, base, 'sine', 0.0045, 0.015, 0.07, 0.22);
  } else if (profile.accentStyle === 'sakura_chime') {
    const note = pick(SAKURA_NOTES);
    scheduleToneBurst(ctx, masterGain, note, note, 'sine', 0.018, 0.02, 1.85, 0);
    scheduleToneBurst(ctx, masterGain, note * 2, note * 2, 'sine', 0.005, 0.015, 0.9, 0.02);
  } else if (profile.accentStyle === 'library_celesta') {
    const note = pick(CELESTA_NOTES);
    scheduleToneBurst(ctx, masterGain, note, note, 'triangle', 0.014, 0.04, 1.6, 0);
  } else if (profile.accentStyle === 'starlight_crystal') {
    const note = pick(STARLIGHT_NOTES);
    scheduleToneBurst(ctx, masterGain, note, note * 1.003, 'sine', 0.015, 0.18, 2.4, 0);
  } else {
    const low = 73.42 + Math.random() * 6;
    scheduleToneBurst(ctx, masterGain, low, low * 0.96, 'sine', 0.024, 0.22, 1.9, 0);
  }
}

/**
 * Pure Web Audio API procedural soundscape + soft footstep engine (0 external files, 0 CDN).
 * Stays OFF with zero `AudioContext` until explicitly enabled via user gesture, suspends cleanly
 * when reading/modal/tab-hidden, and calls `AudioContext.close()` on `dispose()`.
 */
export function createAmbientAudioEngine(): AmbientAudioEngine {
  let enabled = false;
  let paused = false;
  let disposed = false;
  let currentBiome: BiomeId = 'town_of_beginnings';
  let currentTheme: AppTheme = 'light';
  let currentBossRoom = false;

  let graph: AudioGraph | null = null;
  let accentTimer: number | null = null;
  let suspendTimer: number | null = null;
  let stepAccumulator = 0.2;
  let leftFootNext = true;

  const clearTimers = () => {
    if (accentTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(accentTimer);
      accentTimer = null;
    }
    if (suspendTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(suspendTimer);
      suspendTimer = null;
    }
  };

  const scheduleNextAccent = () => {
    if (accentTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(accentTimer);
      accentTimer = null;
    }
    if (!enabled || paused || disposed || typeof window === 'undefined') return;
    const profile = getBiomeSoundscapeProfile(currentBiome, currentTheme, currentBossRoom);
    const delay =
      profile.accentMinMs + Math.random() * Math.max(500, profile.accentMaxMs - profile.accentMinMs);
    accentTimer = window.setTimeout(() => {
      accentTimer = null;
      if (graph && enabled && !paused && !disposed && graph.ctx.state === 'running') {
        playAccentForProfile(graph, getBiomeSoundscapeProfile(currentBiome, currentTheme, currentBossRoom));
      }
      scheduleNextAccent();
    }, delay);
  };

  const syncPlaybackState = () => {
    if (disposed) return;
    if (enabled && !paused) {
      if (suspendTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(suspendTimer);
        suspendTimer = null;
      }
      if (!graph) {
        graph = buildAudioGraph(getBiomeSoundscapeProfile(currentBiome, currentTheme, currentBossRoom));
      }
      if (!graph) return;
      if (graph.ctx.state === 'suspended') void graph.ctx.resume().catch(() => {});
      graph.masterGain.gain.setTargetAtTime(MASTER_ACTIVE_GAIN, graph.ctx.currentTime, 0.24);
      scheduleNextAccent();
      return;
    }

    clearTimers();
    if (graph) {
      graph.masterGain.gain.setTargetAtTime(0.0001, graph.ctx.currentTime, 0.06);
      if (graph.ctx.state === 'running' && typeof window !== 'undefined') {
        suspendTimer = window.setTimeout(() => {
          suspendTimer = null;
          if (!disposed && (!enabled || paused) && graph && graph.ctx.state === 'running') {
            void graph.ctx.suspend().catch(() => {});
          }
        }, 160);
      }
    }
  };

  const playFootstepSound = (isRunning: boolean) => {
    if (!graph || graph.ctx.state !== 'running') return;
    const { ctx, masterGain, noiseBuffer } = graph;
    const profile = getBiomeSoundscapeProfile(currentBiome, currentTheme, currentBossRoom);
    const now = ctx.currentTime;
    const pitchJitter = (leftFootNext ? 0.95 : 1.05) * (0.94 + Math.random() * 0.12);
    leftFootNext = !leftFootNext;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(profile.footstepFreq * pitchJitter, now);
    filter.Q.setValueAtTime(profile.footstepQ, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(isRunning ? 0.16 : 0.105, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.058);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // Ignore on rapid unmount
      }
    };
    src.start(now, Math.random() * Math.max(0.2, NOISE_BUFFER_SEC - 0.15), 0.07);
    scheduleToneBurst(ctx, masterGain, 118 * pitchJitter, 62 * pitchJitter, 'sine', isRunning ? 0.036 : 0.022, 0.006, 0.042);
  };

  return {
    isEnabled: () => enabled,
    isPaused: () => paused,
    setEnabled(next: boolean) {
      if (disposed || enabled === next) return;
      enabled = next;
      syncPlaybackState();
    },
    setPaused(next: boolean) {
      if (disposed || paused === next) return;
      paused = next;
      if (paused) stepAccumulator = 0.18;
      syncPlaybackState();
    },
    setEnvironment(biomeId: BiomeId, theme: AppTheme, inBossRoom: boolean) {
      if (currentBiome === biomeId && currentTheme === theme && currentBossRoom === inBossRoom) return;
      currentBiome = biomeId;
      currentTheme = theme;
      currentBossRoom = inBossRoom;
      if (graph) applyGraphProfile(graph, getBiomeSoundscapeProfile(biomeId, theme, inBossRoom), false);
    },
    stepFootstep(dt: number, speed: number, isRunning: boolean) {
      if (!enabled || paused || disposed || !graph || graph.ctx.state !== 'running') {
        stepAccumulator = 0.2;
        return;
      }
      if (speed < 0.55) {
        stepAccumulator = Math.min(stepAccumulator, 0.22);
        return;
      }
      stepAccumulator += dt;
      if (stepAccumulator >= (isRunning ? RUN_STEP_INTERVAL_SEC : WALK_STEP_INTERVAL_SEC)) {
        stepAccumulator = 0;
        playFootstepSound(isRunning);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      clearTimers();
      if (!graph) return;

      const closing = graph;
      graph = null;
      const nodes: AudioScheduledSourceNode[] = [
        closing.noiseSrc, closing.lfoOsc, closing.padOsc1, closing.padOsc2,
      ];
      for (let i = 0; i < nodes.length; i += 1) {
        try { nodes[i].stop(); } catch { /* ignore */ }
        try { nodes[i].disconnect(); } catch { /* ignore */ }
      }
      try {
        void closing.ctx.close().catch(() => {});
      } catch {
        // Ignore close errors in constrained environments
      }
    },
  };
}
