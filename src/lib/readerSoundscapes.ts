/**
 * Bộ tổng hợp Âm thanh Môi trường Đọc sách (Reader Soundscapes) bằng Web Audio API thuần:
 * - 0 phụ thuộc `three`, 0 CDN, 0 tệp âm thanh ngoài (`$0`, `0 B` R2).
 * - Luôn mặc định TẮT (`preset = 'off'`) khi mở sách (`QĐ-2 = 2A`), chỉ lưu `volume` & `pageTurnSound` ở `localStorage`.
 * - Tự `suspend()` khi ẩn tab (`visibilityState === 'hidden'`) và `AudioContext.close()` triệt để khi đóng sách.
 */

export type ReaderSoundscapeId = 'off' | 'night_rain' | 'warm_study' | 'sakura_wind' | 'late_hearth';
export type SleepTimerMinutes = 0 | 15 | 30 | 60;

export interface ReaderSoundPrefs {
  volume: number;
  pageTurnSound: boolean;
}

const SOUND_PREFS_STORAGE_KEY = 'ofu-reader-soundscape-prefs-v1';

export const SOUNDSCAPE_OPTIONS: ReadonlyArray<{
  id: ReaderSoundscapeId;
  label: string;
  subtitle: string;
}> = [
  { id: 'off', label: 'Tắt âm nền', subtitle: 'Yên tĩnh hoàn toàn' },
  { id: 'night_rain', label: 'Mưa đêm', subtitle: 'Tiếng mưa rơi dịu ngoài hiên' },
  { id: 'warm_study', label: 'Thư phòng ấm', subtitle: 'Không gian tĩnh lặng trầm ấm' },
  { id: 'sakura_wind', label: 'Gió rừng anh đào', subtitle: 'Gió thoảng qua tán lá nhẹ' },
  { id: 'late_hearth', label: 'Lò sưởi khuya', subtitle: 'Củi lửa tí tách êm dịu' },
];

export function loadReaderSoundPrefs(): ReaderSoundPrefs {
  try {
    const raw = localStorage.getItem(SOUND_PREFS_STORAGE_KEY);
    if (!raw) return { volume: 0.45, pageTurnSound: false };
    const parsed = JSON.parse(raw) as Partial<ReaderSoundPrefs>;
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.min(1, Math.max(0.05, Math.round(parsed.volume * 100) / 100))
        : 0.45;
    return { volume, pageTurnSound: Boolean(parsed.pageTurnSound) };
  } catch {
    return { volume: 0.45, pageTurnSound: false };
  }
}

export function saveReaderSoundPrefs(prefs: ReaderSoundPrefs): void {
  try {
    localStorage.setItem(SOUND_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

function createNoiseBuffer(ctx: AudioContext, seconds: number, mode: 'pink' | 'brown'): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);

  if (mode === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.022 * white) / 1.022;
      out[i] = last * 3.1;
    }
  } else {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.1;
      b6 = white * 0.115926;
    }
  }
  return buffer;
}

export interface ReaderSoundscapeEngine {
  setPreset: (preset: ReaderSoundscapeId) => void;
  setVolume: (volume: number) => void;
  setFadeMultiplier: (mult: number) => void;
  playPageTurn: (volume: number) => void;
  setDocumentHidden: (hidden: boolean) => void;
  dispose: () => void;
}

export function createReaderSoundscapeEngine(): ReaderSoundscapeEngine {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let activeCleanup: (() => void) | null = null;
  let currentPreset: ReaderSoundscapeId = 'off';
  let userVolume = 0.45;
  let fadeMult = 1;
  let isDisposed = false;
  let pinkBuf: AudioBuffer | null = null;
  let brownBuf: AudioBuffer | null = null;

  const ensureContext = (): AudioContext | null => {
    if (isDisposed || typeof window === 'undefined') return null;
    if (!ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      ctx = new AudioCtor();
      masterGain = ctx.createGain();
      masterGain.gain.value = userVolume * fadeMult;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    return ctx;
  };

  const syncGain = () => {
    if (!ctx || !masterGain) return;
    const target = Math.max(0, Math.min(1, userVolume * fadeMult));
    masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
  };

  const stopActiveGraph = () => {
    activeCleanup?.();
    activeCleanup = null;
  };

  const startPresetGraph = (preset: ReaderSoundscapeId) => {
    stopActiveGraph();
    currentPreset = preset;
    if (preset === 'off') {
      if (ctx && ctx.state === 'running') {
        void ctx.suspend().catch(() => undefined);
      }
      return;
    }

    const audio = ensureContext();
    if (!audio || !masterGain) return;
    if (!pinkBuf) pinkBuf = createNoiseBuffer(audio, 4, 'pink');
    if (!brownBuf) brownBuf = createNoiseBuffer(audio, 4, 'brown');

    const groupGain = audio.createGain();
    groupGain.gain.setValueAtTime(0.001, audio.currentTime);
    groupGain.gain.exponentialRampToValueAtTime(1, audio.currentTime + 0.65);
    groupGain.connect(masterGain);

    const nodesToStop: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];

    const makeLoopNoise = (buf: AudioBuffer) => {
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      nodesToStop.push(src);
      return src;
    };

    if (preset === 'night_rain') {
      const rainSrc = makeLoopNoise(pinkBuf);
      const lp = audio.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1350;
      const hp = audio.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 210;
      const g = audio.createGain();
      g.gain.value = 0.42;
      rainSrc.connect(lp);
      lp.connect(hp);
      hp.connect(g);
      g.connect(groupGain);
      rainSrc.start();

      const dropTimer = window.setInterval(() => {
        if (audio.state !== 'running') return;
        if (Math.random() > 0.55) return;
        const osc = audio.createOscillator();
        const dg = audio.createGain();
        const now = audio.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(680 + Math.random() * 520, now);
        osc.frequency.exponentialRampToValueAtTime(340, now + 0.09);
        dg.gain.setValueAtTime(0.018 * Math.random(), now);
        dg.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        osc.connect(dg);
        dg.connect(groupGain);
        osc.start(now);
        osc.stop(now + 0.12);
      }, 950);
      timers.push(dropTimer);
    } else if (preset === 'warm_study') {
      const roomSrc = makeLoopNoise(brownBuf);
      const lp = audio.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      const rg = audio.createGain();
      rg.gain.value = 0.36;
      roomSrc.connect(lp);
      lp.connect(rg);
      rg.connect(groupGain);
      roomSrc.start();

      for (const freq of [110, 164.81]) {
        const osc = audio.createOscillator();
        const og = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        og.gain.value = 0.022;
        osc.connect(og);
        og.connect(groupGain);
        osc.start();
        nodesToStop.push(osc);
      }
    } else if (preset === 'sakura_wind') {
      const windSrc = makeLoopNoise(pinkBuf);
      const bp = audio.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 460;
      bp.Q.value = 1.6;

      const lfo = audio.createOscillator();
      const lfoGain = audio.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = 210;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);

      const wg = audio.createGain();
      wg.gain.value = 0.46;
      windSrc.connect(bp);
      bp.connect(wg);
      wg.connect(groupGain);
      windSrc.start();
      lfo.start();
      nodesToStop.push(lfo);

      const chimeNotes = [523.25, 587.33, 659.25, 783.99, 880];
      const chimeTimer = window.setInterval(() => {
        if (audio.state !== 'running' || Math.random() > 0.36) return;
        const now = audio.currentTime;
        const osc = audio.createOscillator();
        const cg = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = chimeNotes[Math.floor(Math.random() * chimeNotes.length)];
        cg.gain.setValueAtTime(0.015, now);
        cg.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
        osc.connect(cg);
        cg.connect(groupGain);
        osc.start(now);
        osc.stop(now + 1.45);
      }, 2400);
      timers.push(chimeTimer);
    } else if (preset === 'late_hearth') {
      const rumble = makeLoopNoise(brownBuf);
      const lp = audio.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const fg = audio.createGain();
      fg.gain.value = 0.48;
      rumble.connect(lp);
      lp.connect(fg);
      fg.connect(groupGain);
      rumble.start();

      const crackleTimer = window.setInterval(() => {
        if (audio.state !== 'running' || Math.random() > 0.65) return;
        if (!pinkBuf) return;
        const now = audio.currentTime;
        const burst = audio.createBufferSource();
        burst.buffer = pinkBuf;
        const hp = audio.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.value = 1800 + Math.random() * 1600;
        hp.Q.value = 2.4;
        const cg = audio.createGain();
        cg.gain.setValueAtTime(0.045 + Math.random() * 0.04, now);
        cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        burst.connect(hp);
        hp.connect(cg);
        cg.connect(groupGain);
        burst.start(now, Math.random() * 2, 0.05);
      }, 280);
      timers.push(crackleTimer);
    }

    activeCleanup = () => {
      for (const id of timers) window.clearInterval(id);
      for (const n of nodesToStop) {
        try {
          n.stop();
          n.disconnect();
        } catch {
          // Ignore already stopped nodes
        }
      }
      try {
        groupGain.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    };
  };

  return {
    setPreset(preset) {
      fadeMult = 1;
      startPresetGraph(preset);
      syncGain();
    },
    setVolume(volume) {
      userVolume = Math.min(1, Math.max(0.05, volume));
      syncGain();
    },
    setFadeMultiplier(mult) {
      fadeMult = Math.min(1, Math.max(0, mult));
      syncGain();
    },
    playPageTurn(volume) {
      if (isDisposed) return;
      const audio = ensureContext();
      if (!audio) return;
      if (!pinkBuf) pinkBuf = createNoiseBuffer(audio, 2, 'pink');
      const now = audio.currentTime;
      const src = audio.createBufferSource();
      src.buffer = pinkBuf;
      const bp = audio.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1400, now);
      bp.frequency.exponentialRampToValueAtTime(680, now + 0.055);
      bp.Q.value = 1.1;
      const g = audio.createGain();
      const peak = Math.min(0.14, Math.max(0.02, volume * 0.16));
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      src.connect(bp);
      bp.connect(g);
      g.connect(audio.destination);
      src.start(now, Math.random() * 0.8, 0.07);
    },
    setDocumentHidden(hidden) {
      if (!ctx || isDisposed) return;
      if (hidden) {
        if (ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      } else if (currentPreset !== 'off' && ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      stopActiveGraph();
      if (ctx) {
        const toClose = ctx;
        ctx = null;
        masterGain = null;
        void toClose.close().catch(() => undefined);
      }
    },
  };
}
