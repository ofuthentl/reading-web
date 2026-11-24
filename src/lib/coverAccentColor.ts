import { useEffect, useState } from 'react';

/**
 * Trích 1 màu chủ đạo từ `coverUrl` (`blob:` đã cache trong IndexedDB) bằng `<canvas>` `16×16` (`< 1 ms`, 0 thư viện ngoài):
 * - Cache cấp module theo `coverKey` (LRU giới hạn `200` khoá) để không tính lại khi mở đi mở lại kệ/sách.
 * - Cân bằng độ bão hoà & độ sáng trung tính để dùng an toàn cho viền / thanh tiến độ trên cả 4 theme App.
 */

const MAX_ACCENT_CACHE = 200;
const accentCache = new Map<string, string | null>();
let sampleCanvas: HTMLCanvasElement | null = null;
let sampleCtx: CanvasRenderingContext2D | null = null;

function getSampleContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sampleCanvas) {
    sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 16;
    sampleCanvas.height = 16;
    sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  return sampleCtx;
}

function normalizeBalancedRgb(r: number, g: number, b: number): string {
  // Đưa độ sáng luma về vùng [82..178] để nổi nhẹ trên cả nền giấy sáng lẫn nền tối
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  let scale = 1;
  if (luma < 82 && luma > 1) scale = 82 / luma;
  else if (luma > 178) scale = 178 / luma;
  const clamp = (v: number) => Math.min(232, Math.max(36, Math.round(v * scale)));
  return `${clamp(r)} ${clamp(g)} ${clamp(b)}`;
}

function sampleImageAccent(img: HTMLImageElement): string | null {
  const ctx = getSampleContext();
  if (!ctx) return null;
  try {
    ctx.clearRect(0, 0, 16, 16);
    ctx.drawImage(img, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let totalWeight = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 180) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < 22 || luma > 235) continue;
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.14) continue;

      const weight = 0.35 + sat * sat * 2.2;
      sumR += r * weight;
      sumG += g * weight;
      sumB += b * weight;
      totalWeight += weight;
    }

    if (totalWeight <= 0.01) return null;
    return normalizeBalancedRgb(sumR / totalWeight, sumG / totalWeight, sumB / totalWeight);
  } catch {
    return null;
  }
}

function rememberAccent(coverKey: string, value: string | null): void {
  if (accentCache.has(coverKey)) accentCache.delete(coverKey);
  accentCache.set(coverKey, value);
  if (accentCache.size > MAX_ACCENT_CACHE) {
    const oldest = accentCache.keys().next().value;
    if (oldest !== undefined) accentCache.delete(oldest);
  }
}

export function extractCoverAccentRgb(
  coverKey: string,
  coverUrl: string,
): Promise<string | null> {
  if (accentCache.has(coverKey)) {
    return Promise.resolve(accentCache.get(coverKey) ?? null);
  }
  if (typeof Image === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const rgb = sampleImageAccent(img);
      rememberAccent(coverKey, rgb);
      resolve(rgb);
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = coverUrl;
  });
}

export function useCoverAccentColor(
  coverKey: string | null | undefined,
  coverUrl: string | null | undefined,
): string | null {
  const [accentRgb, setAccentRgb] = useState<string | null>(() =>
    coverKey && accentCache.has(coverKey) ? (accentCache.get(coverKey) ?? null) : null,
  );

  useEffect(() => {
    if (!coverKey || !coverUrl) {
      setAccentRgb(null);
      return;
    }
    if (accentCache.has(coverKey)) {
      setAccentRgb(accentCache.get(coverKey) ?? null);
      return;
    }
    let cancelled = false;
    void extractCoverAccentRgb(coverKey, coverUrl).then((rgb) => {
      if (!cancelled) setAccentRgb(rgb);
    });
    return () => {
      cancelled = true;
    };
  }, [coverKey, coverUrl]);

  return accentRgb;
}
