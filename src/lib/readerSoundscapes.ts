/**
 * Bộ phát Âm thanh Môi trường Đọc sách (Reader Soundscapes — PA-A):
 * - Phát 3 bản nhạc nền Piano/Lofi + tiếng môi trường thật nối vòng lặp mượt (`acrossfade`) lưu nội bộ tại `public/sounds/*.m4a` (`0` CDN, `0 B` R2, `0 B` tải trước khi chưa bật).
 * - Định tuyến `<audio loop>` qua Web Audio `GainNode` để thanh Âm lượng & Hẹn giờ tắt êm (`15/30/60p` fade-out) hoạt động trọn vẹn trên cả Safari iOS lẫn Desktop/Android.
 * - Luôn mặc định TẮT (`preset = 'off'`) khi mở sách (`QĐ-2 = 2A`), chỉ lưu `volume` & `pageTurnSound` ở `localStorage`.
 * - Tự tạm dừng/`suspend()` khi ẩn tab và giải phóng bộ đệm `<audio>` + `AudioContext.close()` khi đóng sách.
 */

export type ReaderSoundscapeId = 'off' | 'night_rain' | 'warm_study' | 'sakura_wind';
export type SleepTimerMinutes = 0 | 15 | 30 | 60;

export interface ReaderSoundPrefs {
  volume: number;
  pageTurnSound: boolean;
}

const SOUND_PREFS_STORAGE_KEY = 'ofu-reader-soundscape-prefs-v1';

type ActiveSoundTrackId = Exclude<ReaderSoundscapeId, 'off'>;

const SOUND_TRACK_FILES: Record<ActiveSoundTrackId, string> = {
  night_rain: 'night-rain.m4a',
  warm_study: 'warm-study.m4a',
  sakura_wind: 'sakura-wind.m4a',
};

export const SOUNDSCAPE_OPTIONS: ReadonlyArray<{
  id: ReaderSoundscapeId;
  label: string;
  subtitle: string;
}> = [
  { id: 'off', label: 'Tắt âm nền', subtitle: 'Yên tĩnh hoàn toàn' },
  { id: 'night_rain', label: 'Mưa đêm', subtitle: 'Piano dịu êm & tiếng mưa rơi ngoài hiên' },
  { id: 'warm_study', label: 'Thư phòng ấm', subtitle: 'Piano thư giãn & lửa ấm bập bùng' },
  { id: 'sakura_wind', label: 'Gió rừng anh đào', subtitle: 'Piano Nhật thanh bình & gió xuân nhẹ' },
];

function resolveSoundUrl(fileName: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}sounds/${fileName}`;
}

export function loadReaderSoundPrefs(): ReaderSoundPrefs {
  try {
    const raw = localStorage.getItem(SOUND_PREFS_STORAGE_KEY);
    if (!raw) return { volume: 0.5, pageTurnSound: false };
    const parsed = JSON.parse(raw) as Partial<ReaderSoundPrefs>;
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.min(1, Math.max(0.05, Math.round(parsed.volume * 100) / 100))
        : 0.5;
    return { volume, pageTurnSound: Boolean(parsed.pageTurnSound) };
  } catch {
    return { volume: 0.5, pageTurnSound: false };
  }
}

export function saveReaderSoundPrefs(prefs: ReaderSoundPrefs): void {
  try {
    localStorage.setItem(SOUND_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

function createPinkNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);
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
  return buffer;
}

interface TrackDeck {
  audio: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null;
  trackGain: GainNode | null;
  pauseTimer: number | null;
  routedViaWebAudio: boolean;
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
  let currentPreset: ReaderSoundscapeId = 'off';
  let userVolume = 0.5;
  let fadeMult = 1;
  let isDisposed = false;
  let isDocHidden = false;
  let pinkBuf: AudioBuffer | null = null;
  const decks = new Map<ActiveSoundTrackId, TrackDeck>();

  const effectiveLinearVolume = () => Math.max(0, Math.min(1, userVolume * fadeMult));

  const ensureContext = (): AudioContext | null => {
    if (isDisposed || typeof window === 'undefined') return null;
    if (!ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        ctx = new AudioCtor();
        masterGain = ctx.createGain();
        masterGain.gain.value = effectiveLinearVolume();
        masterGain.connect(ctx.destination);
      } catch {
        ctx = null;
        masterGain = null;
        return null;
      }
    }
    if (!isDocHidden && ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    return ctx;
  };

  const syncGain = () => {
    const target = effectiveLinearVolume();
    if (ctx && masterGain) {
      masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    }
    for (const [id, deck] of decks.entries()) {
      if (!deck.routedViaWebAudio && id === currentPreset) {
        deck.audio.volume = target;
      }
    }
  };

  const ensureDeck = (id: ActiveSoundTrackId): TrackDeck | null => {
    if (isDisposed || typeof Audio === 'undefined') return null;
    const existing = decks.get(id);
    if (existing) return existing;

    const audio = new Audio(resolveSoundUrl(SOUND_TRACK_FILES[id]));
    audio.loop = true;
    audio.preload = 'auto';
    audio.setAttribute('playsinline', 'true');

    const audioCtx = ensureContext();
    let sourceNode: MediaElementAudioSourceNode | null = null;
    let trackGain: GainNode | null = null;
    let routedViaWebAudio = false;

    if (audioCtx && masterGain) {
      try {
        sourceNode = audioCtx.createMediaElementSource(audio);
        trackGain = audioCtx.createGain();
        trackGain.gain.value = 0.0001;
        sourceNode.connect(trackGain);
        trackGain.connect(masterGain);
        audio.volume = 1;
        routedViaWebAudio = true;
      } catch {
        sourceNode = null;
        trackGain = null;
        audio.volume = effectiveLinearVolume();
      }
    } else {
      audio.volume = effectiveLinearVolume();
    }

    const deck: TrackDeck = {
      audio,
      sourceNode,
      trackGain,
      pauseTimer: null,
      routedViaWebAudio,
    };
    decks.set(id, deck);
    return deck;
  };

  const fadeOutDeck = (deck: TrackDeck) => {
    if (deck.pauseTimer !== null) {
      window.clearTimeout(deck.pauseTimer);
      deck.pauseTimer = null;
    }
    if (ctx && deck.trackGain && deck.routedViaWebAudio) {
      const now = ctx.currentTime;
      deck.trackGain.gain.cancelScheduledValues(now);
      deck.trackGain.gain.setValueAtTime(Math.max(0.0001, deck.trackGain.gain.value), now);
      deck.trackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      deck.pauseTimer = window.setTimeout(() => {
        deck.pauseTimer = null;
        deck.audio.pause();
      }, 340);
    } else {
      deck.audio.pause();
    }
  };

  const fadeInDeck = (deck: TrackDeck) => {
    if (deck.pauseTimer !== null) {
      window.clearTimeout(deck.pauseTimer);
      deck.pauseTimer = null;
    }
    if (ctx && deck.trackGain && deck.routedViaWebAudio) {
      const now = ctx.currentTime;
      deck.trackGain.gain.cancelScheduledValues(now);
      deck.trackGain.gain.setValueAtTime(Math.max(0.0001, deck.trackGain.gain.value), now);
      deck.trackGain.gain.exponentialRampToValueAtTime(1, now + 0.55);
    } else {
      deck.audio.volume = effectiveLinearVolume();
    }
    if (!isDocHidden) {
      void deck.audio.play().catch(() => undefined);
    }
  };

  const switchPreset = (preset: ReaderSoundscapeId) => {
    currentPreset = preset;
    for (const [id, deck] of decks.entries()) {
      if (id !== preset) fadeOutDeck(deck);
    }
    if (preset === 'off') return;
    ensureContext();
    const activeDeck = ensureDeck(preset);
    if (activeDeck) fadeInDeck(activeDeck);
  };

  return {
    setPreset(preset) {
      if (isDisposed) return;
      fadeMult = 1;
      switchPreset(preset);
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
      if (isDisposed || isDocHidden) return;
      const audio = ensureContext();
      if (!audio) return;
      if (!pinkBuf) pinkBuf = createPinkNoiseBuffer(audio, 1.2);
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
      src.start(now, Math.random() * 0.6, 0.07);
    },
    setDocumentHidden(hidden) {
      if (isDisposed) return;
      isDocHidden = hidden;
      if (hidden) {
        for (const deck of decks.values()) {
          if (deck.pauseTimer !== null) {
            window.clearTimeout(deck.pauseTimer);
            deck.pauseTimer = null;
          }
          deck.audio.pause();
        }
        if (ctx && ctx.state === 'running') {
          void ctx.suspend().catch(() => undefined);
        }
      } else if (currentPreset !== 'off') {
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume().catch(() => undefined);
        }
        const deck = decks.get(currentPreset);
        if (deck) {
          void deck.audio.play().catch(() => undefined);
        }
      }
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      for (const deck of decks.values()) {
        if (deck.pauseTimer !== null) {
          window.clearTimeout(deck.pauseTimer);
          deck.pauseTimer = null;
        }
        try {
          deck.audio.pause();
          deck.audio.removeAttribute('src');
          deck.audio.load();
        } catch {
          // Ignore media cleanup errors
        }
        try {
          deck.sourceNode?.disconnect();
          deck.trackGain?.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      decks.clear();
      if (ctx) {
        const toClose = ctx;
        ctx = null;
        masterGain = null;
        void toClose.close().catch(() => undefined);
      }
    },
  };
}
