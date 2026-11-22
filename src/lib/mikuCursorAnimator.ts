interface CursorAnimSpec {
  selector: string;
  hotX: number;
  hotY: number;
  fallback: string;
  frames: readonly number[];
}

const SHEET_COLS = 16;
const CELL_PX = 32;
const TOTAL_SPRITES = 123;
const STEP_COUNT = 12;
const FRAME_INTERVAL_MS = 84; // Chuẩn jifRate = 5/60s (~83.3ms) của tệp .ani gốc

const CURSOR_SPECS: readonly CursorAnimSpec[] = [
  {
    selector: 'html, body, .cursor-default',
    hotX: 1,
    hotY: 0,
    fallback: 'auto',
    frames: [0, 1, 2, 3, 4, 5, 0, 1, 6, 7, 8, 9],
  },
  {
    selector:
      "a[href], button:not(:disabled), [role='button']:not([aria-disabled='true']), summary, select:not(:disabled), input[type='checkbox']:not(:disabled), input[type='radio']:not(:disabled), input[type='range']:not(:disabled), input[type='file']:not(:disabled), input[type='submit']:not(:disabled), input[type='button']:not(:disabled), label[for], .cursor-pointer, .cursor-zoom-out",
    hotX: 4,
    hotY: 0,
    fallback: 'pointer',
    frames: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  },
  {
    selector:
      "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='submit']):not([type='button']):not(:disabled), textarea:not(:disabled), [contenteditable='true'], .reading-content p, .reading-content li, .reading-content blockquote, .cursor-text",
    hotX: 4,
    hotY: 9,
    fallback: 'text',
    frames: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
  },
  {
    selector: '.reading-content a[href]',
    hotX: 4,
    hotY: 0,
    fallback: 'pointer',
    frames: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  },
  {
    selector: '.reading-content img, .cursor-zoom-in, .cursor-crosshair',
    hotX: 5,
    hotY: 6,
    fallback: 'crosshair',
    frames: [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
  },
  {
    selector:
      "button[aria-label*='Chỉnh sửa']:not(:disabled), button[aria-label*='Đổi tên']:not(:disabled), button[title*='ghi chú']:not(:disabled), .cursor-miku-pen",
    hotX: 0,
    hotY: 0,
    fallback: 'pointer',
    frames: [113, 114, 115, 116, 117, 118, 113, 114, 119, 120, 121, 122],
  },
  {
    selector:
      "button[aria-label*='yêu thích' i]:not(:disabled), [aria-label*='Ủng hộ'] button:not(:disabled), [aria-label*='Ủng hộ'] a[href], .cursor-miku-heart",
    hotX: 4,
    hotY: 3,
    fallback: 'pointer',
    frames: [102, 103, 104, 105, 106, 107, 102, 108, 109, 110, 111, 112],
  },
  {
    selector: '.cursor-move, .cursor-grab, .cursor-grabbing, .active\\:cursor-grabbing:active',
    hotX: 15,
    hotY: 15,
    fallback: 'move',
    frames: [72, 73, 74, 75, 76, 77, 72, 73, 74, 75, 76, 77],
  },
  {
    selector: '.cursor-ew-resize, .cursor-col-resize',
    hotX: 15,
    hotY: 15,
    fallback: 'ew-resize',
    frames: [90, 91, 92, 93, 94, 95, 90, 91, 92, 93, 94, 95],
  },
  {
    selector: '.cursor-ns-resize, .cursor-row-resize',
    hotX: 15,
    hotY: 15,
    fallback: 'ns-resize',
    frames: [96, 97, 98, 99, 100, 101, 96, 97, 98, 99, 100, 101],
  },
  {
    selector: '.cursor-wait',
    hotX: 15,
    hotY: 15,
    fallback: 'wait',
    frames: [40, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 40],
  },
  {
    selector: '.cursor-progress',
    hotX: 1,
    hotY: 1,
    fallback: 'progress',
    frames: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61],
  },
  {
    selector: '.cursor-help',
    hotX: 1,
    hotY: 0,
    fallback: 'help',
    frames: [62, 63, 64, 65, 66, 67, 62, 63, 68, 69, 70, 71],
  },
  {
    selector:
      ":disabled, button:disabled, input:disabled, select:disabled, textarea:disabled, label:has(> input:disabled), [aria-disabled='true'], .cursor-not-allowed, .disabled\\:cursor-not-allowed:disabled",
    hotX: 7,
    hotY: 7,
    fallback: 'not-allowed',
    frames: [34, 35, 36, 37, 38, 39, 34, 35, 36, 37, 38, 39],
  },
];

let activeControllerDispose: (() => void) | null = null;
let bootPromise: Promise<void> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load Miku cursor sheet'));
    img.src = src;
  });
}

async function sliceSpriteSheetUrls(sheetImg: HTMLImageElement): Promise<{
  urls: string[];
  keepAlive: HTMLImageElement[];
}> {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_PX;
  canvas.height = CELL_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const urls: string[] = [];
  const keepAlive: HTMLImageElement[] = [];

  try {
    for (let i = 0; i < TOTAL_SPRITES; i += 1) {
      const sx = (i % SHEET_COLS) * CELL_PX;
      const sy = Math.floor(i / SHEET_COLS) * CELL_PX;
      ctx.clearRect(0, 0, CELL_PX, CELL_PX);
      ctx.drawImage(sheetImg, sx, sy, CELL_PX, CELL_PX, 0, 0, CELL_PX, CELL_PX);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('Failed to encode cursor frame');
      const objectUrl = URL.createObjectURL(blob);
      urls.push(objectUrl);

      const preload = new Image();
      preload.src = objectUrl;
      await preload.decode().catch(() => undefined);
      keepAlive.push(preload);
    }
    return { urls, keepAlive };
  } catch (err) {
    for (const u of urls) URL.revokeObjectURL(u);
    throw err;
  }
}

export function startMikuCursorAnimation(): Promise<void> {
  if (activeControllerDispose || bootPromise) return bootPromise ?? Promise.resolve();

  const pointerMq = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!pointerMq.matches || reducedMotionMq.matches) return Promise.resolve();

  bootPromise = (async () => {
    try {
      const sheetUrl = `${import.meta.env.BASE_URL}cursors/miku-sheet.png`;
      const sheetImg = await loadImage(sheetUrl);
      const { urls, keepAlive } = await sliceSpriteSheetUrls(sheetImg);

      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-miku-animated-cursors', 'true');
      styleEl.textContent = CURSOR_SPECS.map((spec) => `${spec.selector} {}`).join('\n');
      document.head.appendChild(styleEl);

      const sheet = styleEl.sheet;
      if (!sheet || sheet.cssRules.length !== CURSOR_SPECS.length) {
        styleEl.remove();
        for (const u of urls) URL.revokeObjectURL(u);
        return;
      }

      const styleRules = Array.from(sheet.cssRules) as CSSStyleRule[];
      const prebuiltValues: string[][] = CURSOR_SPECS.map((spec) =>
        spec.frames.map(
          (spriteIdx) => `url("${urls[spriteIdx]}") ${spec.hotX} ${spec.hotY}, ${spec.fallback}`,
        ),
      );

      let step = 0;
      let timerId: number | null = null;

      const applyStep = (nextStep: number) => {
        for (let r = 0; r < styleRules.length; r += 1) {
          styleRules[r].style.cursor = prebuiltValues[r][nextStep];
        }
      };

      const stopTicker = () => {
        if (timerId !== null) {
          window.clearInterval(timerId);
          timerId = null;
        }
      };

      const syncPlayback = () => {
        const shouldPlay =
          document.visibilityState === 'visible' &&
          pointerMq.matches &&
          !reducedMotionMq.matches;

        if (!shouldPlay) {
          stopTicker();
          if (reducedMotionMq.matches || !pointerMq.matches) {
            styleEl.disabled = true;
          }
          return;
        }

        styleEl.disabled = false;
        if (timerId === null) {
          applyStep(step);
          timerId = window.setInterval(() => {
            step = (step + 1) % STEP_COUNT;
            applyStep(step);
          }, FRAME_INTERVAL_MS);
        }
      };

      document.addEventListener('visibilitychange', syncPlayback);
      pointerMq.addEventListener('change', syncPlayback);
      reducedMotionMq.addEventListener('change', syncPlayback);
      syncPlayback();

      const dispose = () => {
        stopTicker();
        document.removeEventListener('visibilitychange', syncPlayback);
        pointerMq.removeEventListener('change', syncPlayback);
        reducedMotionMq.removeEventListener('change', syncPlayback);
        styleEl.remove();
        keepAlive.length = 0;
        for (const u of urls) URL.revokeObjectURL(u);
        activeControllerDispose = null;
      };

      activeControllerDispose = dispose;
      window.addEventListener('pagehide', dispose, { once: true });
    } catch {
      // Giữ nguyên bộ con trỏ tĩnh Miku trong index.css nếu tải sheet lỗi
    } finally {
      bootPromise = null;
    }
  })();

  return bootPromise;
}
