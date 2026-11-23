interface CursorGroupSpec {
  selector: string | null;
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

// Sắp theo thứ tự ưu tiên từ đặc thù nhất đến tổng quát nhất (nhóm cuối selector = null là mặc định trên body)
const CURSOR_GROUPS: readonly CursorGroupSpec[] = [
  {
    selector: ":disabled, [aria-disabled='true'], .cursor-not-allowed",
    hotX: 7,
    hotY: 7,
    fallback: 'not-allowed',
    frames: [34, 35, 36, 37, 38, 39, 34, 35, 36, 37, 38, 39],
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
    selector: '.cursor-move, .cursor-grab, .cursor-grabbing',
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
    selector:
      "button[aria-label*='yêu thích' i], [aria-label*='Ủng hộ'] button, [aria-label*='Ủng hộ'] a[href], .cursor-miku-heart",
    hotX: 4,
    hotY: 3,
    fallback: 'pointer',
    frames: [102, 103, 104, 105, 106, 107, 102, 108, 109, 110, 111, 112],
  },
  {
    selector:
      "button[aria-label*='Chỉnh sửa'], button[aria-label*='Đổi tên'], button[title*='ghi chú'], .cursor-miku-pen",
    hotX: 0,
    hotY: 0,
    fallback: 'pointer',
    frames: [113, 114, 115, 116, 117, 118, 113, 114, 119, 120, 121, 122],
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
      "a[href], button, [role='button'], summary, select, input[type='checkbox'], input[type='radio'], input[type='range'], input[type='file'], input[type='submit'], input[type='button'], label[for], .cursor-pointer, .cursor-zoom-out",
    hotX: 4,
    hotY: 0,
    fallback: 'pointer',
    frames: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  },
  {
    selector:
      "input, textarea, [contenteditable='true'], .reading-content p, .reading-content li, .reading-content blockquote, .cursor-text",
    hotX: 4,
    hotY: 9,
    fallback: 'text',
    frames: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
  },
  {
    selector: null,
    hotX: 1,
    hotY: 0,
    fallback: 'auto',
    frames: [0, 1, 2, 3, 4, 5, 0, 1, 6, 7, 8, 9],
  },
];

const DEFAULT_GROUP_IDX = CURSOR_GROUPS.length - 1;

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

function resolveHoveredCursorTarget(rawTarget: EventTarget | null): {
  element: HTMLElement;
  groupIdx: number;
} {
  const fallbackEl = document.body || document.documentElement;
  if (!(rawTarget instanceof Element)) {
    return { element: fallbackEl, groupIdx: DEFAULT_GROUP_IDX };
  }

  // Trường hợp label bọc checkbox/radio đang disabled
  const enclosingLabel = rawTarget.closest('label');
  if (enclosingLabel && enclosingLabel.querySelector('input:disabled')) {
    return { element: enclosingLabel as HTMLElement, groupIdx: 0 };
  }

  for (let i = 0; i < DEFAULT_GROUP_IDX; i += 1) {
    const sel = CURSOR_GROUPS[i].selector;
    if (!sel) continue;
    const matched = rawTarget.closest(sel);
    if (matched instanceof HTMLElement) {
      return { element: matched, groupIdx: i };
    }
  }

  const explicitDefault = rawTarget.closest('.cursor-default');
  if (explicitDefault instanceof HTMLElement) {
    return { element: explicitDefault, groupIdx: DEFAULT_GROUP_IDX };
  }

  return { element: fallbackEl, groupIdx: DEFAULT_GROUP_IDX };
}

/**
 * Phát hoạt ảnh 12 khung cho con trỏ Miku với chi phí ~0.004ms/nhịp:
 * - KHÔNG sửa stylesheet toàn trang (tránh `RecalcStyle` trên hàng nghìn DOM node).
 * - Chỉ cập nhật inline `style.cursor` trên ĐÚNG 1 phần tử đang trỏ chuột.
 * - Tự động ngắt nhịp `0ms` trong suốt lúc người dùng đang cuộn trang (`scroll`).
 */
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

      const prebuiltValues: string[][] = CURSOR_GROUPS.map((spec) =>
        spec.frames.map(
          (spriteIdx) => `url("${urls[spriteIdx]}") ${spec.hotX} ${spec.hotY}, ${spec.fallback}`,
        ),
      );

      let step = 0;
      let timerId: number | null = null;
      let scrollResumeTimer: number | null = null;
      let scrolling = false;
      let currentEl: HTMLElement | null = document.body || document.documentElement;
      let currentGroupIdx = DEFAULT_GROUP_IDX;
      let lastAppliedValue = '';

      const clearInlineCursor = () => {
        if (currentEl && currentEl.isConnected && currentEl.style.cursor === lastAppliedValue) {
          currentEl.style.removeProperty('cursor');
        }
        lastAppliedValue = '';
      };

      const applyCurrentFrame = () => {
        if (!currentEl || scrolling) return;
        if (!currentEl.isConnected) {
          currentEl = document.body || document.documentElement;
          currentGroupIdx = DEFAULT_GROUP_IDX;
          lastAppliedValue = '';
        }
        if ('disabled' in currentEl && Boolean((currentEl as HTMLButtonElement).disabled)) {
          currentGroupIdx = 0;
        }
        const nextVal = prebuiltValues[currentGroupIdx][step];
        if (nextVal !== lastAppliedValue) {
          currentEl.style.cursor = nextVal;
          lastAppliedValue = nextVal;
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
          !scrolling &&
          document.visibilityState === 'visible' &&
          pointerMq.matches &&
          !reducedMotionMq.matches;

        if (!shouldPlay) {
          stopTicker();
          clearInlineCursor();
          return;
        }

        if (timerId === null) {
          applyCurrentFrame();
          timerId = window.setInterval(() => {
            step = (step + 1) % STEP_COUNT;
            applyCurrentFrame();
          }, FRAME_INTERVAL_MS);
        }
      };

      const onPointerOver = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || scrolling) return;
        const resolved = resolveHoveredCursorTarget(event.target);
        if (resolved.element !== currentEl || resolved.groupIdx !== currentGroupIdx) {
          clearInlineCursor();
          currentEl = resolved.element;
          currentGroupIdx = resolved.groupIdx;
          if (timerId !== null) applyCurrentFrame();
        }
      };

      const onWindowScroll = () => {
        if (!scrolling) {
          scrolling = true;
          syncPlayback();
        }
        if (scrollResumeTimer !== null) window.clearTimeout(scrollResumeTimer);
        scrollResumeTimer = window.setTimeout(() => {
          scrolling = false;
          scrollResumeTimer = null;
          syncPlayback();
        }, 160);
      };

      window.addEventListener('pointerover', onPointerOver, { passive: true });
      window.addEventListener('scroll', onWindowScroll, { passive: true });
      document.addEventListener('visibilitychange', syncPlayback);
      pointerMq.addEventListener('change', syncPlayback);
      reducedMotionMq.addEventListener('change', syncPlayback);
      syncPlayback();

      const onPageHide = (event: PageTransitionEvent) => {
        if (event.persisted) {
          stopTicker();
          clearInlineCursor();
          return;
        }
        dispose();
      };

      const onPageShow = (event: PageTransitionEvent) => {
        if (event.persisted) {
          syncPlayback();
        }
      };

      const dispose = () => {
        stopTicker();
        if (scrollResumeTimer !== null) window.clearTimeout(scrollResumeTimer);
        clearInlineCursor();
        window.removeEventListener('pointerover', onPointerOver);
        window.removeEventListener('scroll', onWindowScroll);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        document.removeEventListener('visibilitychange', syncPlayback);
        pointerMq.removeEventListener('change', syncPlayback);
        reducedMotionMq.removeEventListener('change', syncPlayback);
        keepAlive.length = 0;
        for (const u of urls) URL.revokeObjectURL(u);
        activeControllerDispose = null;
      };

      activeControllerDispose = dispose;
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('pageshow', onPageShow);
    } catch {
      // Giữ nguyên bộ con trỏ tĩnh Miku trong index.css nếu tải sheet lỗi
    } finally {
      bootPromise = null;
    }
  })();

  return bootPromise;
}
