import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { hardenProtectedCanvas } from '@/lib/guestCanvasPaint';

export type ReaderLightboxTarget =
  | { kind: 'dom'; src: string; alt?: string }
  | { kind: 'guest-bitmap'; bitmap: ImageBitmap; watermarkLabel: string; alt?: string };

export interface ReaderImageLightboxProps {
  target: ReaderLightboxTarget | null;
  onClose: () => void;
}

function drawProtectedZoomedBitmap(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  watermarkLabel: string,
) {
  const ctx = hardenProtectedCanvas(canvas);
  if (!ctx) return;

  const maxW = Math.min(1440, Math.max(320, window.innerWidth * 0.88));
  const maxH = Math.min(1440, Math.max(320, window.innerHeight * 0.82));
  const fitScale = Math.min(1, maxW / Math.max(1, bitmap.width), maxH / Math.max(1, bitmap.height));
  const cssW = Math.max(160, Math.round(bitmap.width * fitScale));
  const cssH = Math.max(120, Math.round(bitmap.height * fitScale));
  const dpr = Math.min(window.devicePixelRatio || 1, 2.25);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.drawImage(bitmap, 0, 0, cssW, cssH);

  // Phủ lưới thuỷ vân định danh Discord lên ảnh phóng to (D-028 / D-029)
  const label = watermarkLabel.trim() || 'Ofu Library';
  ctx.font = '500 13px "Be Vietnam Pro", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const stepX = 230;
  const stepY = 148;
  for (let gy = -80; gy <= cssH + 120; gy += stepY) {
    const shift = (Math.round(gy / stepY) & 1) === 1 ? stepX * 0.5 : 0;
    for (let gx = -100 + shift; gx <= cssW + 120; gx += stepX) {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(-0.34);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fillText(label, 1, 1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

export function ReaderImageLightbox({ target, onClose }: ReaderImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const didDragRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const guestCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    didDragRef.current = false;
  }, [target]);

  // Đăng ký wheel listener với { passive: false } để e.preventDefault() hoạt động chuẩn (vá H-09)
  useEffect(() => {
    const el = overlayRef.current;
    if (!target || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoom((prev) => {
        const next = Math.min(3.5, Math.max(0.75, Math.round((prev + delta) * 100) / 100));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === '+' || event.key === '=') {
        setZoom((z) => Math.min(3.5, Math.round((z + 0.25) * 100) / 100));
      } else if (event.key === '-') {
        setZoom((z) => {
          const next = Math.max(0.75, Math.round((z - 0.25) * 100) / 100);
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
      } else if (event.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, target]);

  useLayoutEffect(() => {
    if (!target || target.kind !== 'guest-bitmap' || !guestCanvasRef.current) return;
    const paint = () => {
      if (guestCanvasRef.current) {
        drawProtectedZoomedBitmap(guestCanvasRef.current, target.bitmap, target.watermarkLabel);
      }
    };
    paint();
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
  }, [target]);

  if (!target) return null;

  const adjustZoom = (delta: number) => {
    setZoom((prev) => {
      const next = Math.min(3.5, Math.max(0.75, Math.round((prev + delta) * 100) / 100));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh minh hoạ phóng to"
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        onClose();
      }}
      className="fixed inset-0 z-[65] flex select-none flex-col bg-black/88 backdrop-blur-md"
    >
      {/* Thanh điều khiển nổi */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white/90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {target.kind === 'guest-bitmap' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px]">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              {target.watermarkLabel}
            </span>
          )}
          {target.alt && <span className="truncate text-white/75">{target.alt}</span>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => adjustZoom(-0.25)}
            aria-label="Thu nhỏ ảnh"
            className="rounded-lg border border-white/15 bg-white/10 p-1.5 transition hover:bg-white/20"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => adjustZoom(0.25)}
            aria-label="Phóng to ảnh"
            className="rounded-lg border border-white/15 bg-white/10 p-1.5 transition hover:bg-white/20"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            aria-label="Đặt lại tỉ lệ ảnh"
            title="Đặt lại 100%"
            className="rounded-lg border border-white/15 bg-white/10 p-1.5 transition hover:bg-white/20"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng khung xem ảnh"
            className="ml-1 rounded-lg border border-white/20 bg-white/15 p-1.5 transition hover:bg-white/25"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Vùng hiển thị ảnh kéo/zoom */}
      <div
        className={`flex flex-1 touch-none items-center justify-center overflow-hidden p-4 ${
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-out'
        }`}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          didDragRef.current = false;
          dragRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            origX: pan.x,
            origY: pan.y,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          if (!didDragRef.current && Math.hypot(dx, dy) > 4) {
            didDragRef.current = true;
          }
          setPan({
            x: dragRef.current.origX + dx,
            y: dragRef.current.origY + dy,
          });
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
          didDragRef.current = false;
        }}
      >
        <div
          onClick={(e) => {
            if (zoom > 1) e.stopPropagation();
          }}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transition: dragRef.current.active ? 'none' : 'transform 140ms ease-out',
          }}
        >
          {target.kind === 'dom' ? (
            <img
              src={target.src}
              alt={target.alt || 'Minh hoạ'}
              draggable={false}
              className="max-h-[82vh] max-w-[90vw] rounded shadow-2xl object-contain"
            />
          ) : (
            <canvas
              ref={guestCanvasRef}
              aria-label={target.alt || 'Minh hoạ bảo mật'}
              className="block rounded shadow-2xl"
            />
          )}
        </div>
      </div>
    </div>
  );
}
