import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { supabase, type Book, type Chapter } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import {
  BookOpen,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  LogOut,
  List,
  X,
  Type,
  Minus,
  Plus,
  Upload,
  FileText,
  Library,
  Trash2,
  Folder,
  ChevronDown,
  Pencil,
  ZoomIn,
  ZoomOut,
  Download,
  RotateCw,
  Search,
  Send,
} from 'lucide-react';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
const pdfWasmUrl = `${import.meta.env.BASE_URL}pdfjs-wasm/`;

type Theme = 'light' | 'dark';
type FontSize = 'small' | 'medium' | 'large';
type ReadingPosition = {
  chapterId: string;
  scrollTop: number;
};

type CloudReadingProgress = ReadingPosition & {
  updatedAt: number;
  completed: boolean;
};

type ReadingProgressPayload = {
  user_id: string;
  book_id: string;
  chapter_id: string;
  scroll_top: number;
  completed: boolean;
  updated_at: string;
};

function readerPositionKey(userId: string, bookId: string) {
  return `reader-last-chapter:v3:${userId}:${bookId}`;
}

function readerChapterPositionKey(userId: string, bookId: string, chapterId: string) {
  return `reader-position-v2:${userId}:${bookId}:chapter:${chapterId}`;
}

function readerCompletedKey(userId: string, bookId: string) {
  return `reader-completed:v1:${userId}:${bookId}`;
}

function readChapterPosition(userId: string, chapter: Chapter): ReadingPosition | null {
  try {
    const saved = localStorage.getItem(readerChapterPositionKey(userId, chapter.book_id, chapter.id));
    const parsed = saved ? JSON.parse(saved) as { scrollTop?: unknown } : null;
    return typeof parsed?.scrollTop === 'number'
      ? { chapterId: chapter.id, scrollTop: parsed.scrollTop }
      : null;
  } catch {
    return null;
  }
}

function readChapterScrollTop(userId: string, bookId: string, chapterId: string) {
  try {
    const saved = localStorage.getItem(readerChapterPositionKey(userId, bookId, chapterId));
    const parsed = saved ? JSON.parse(saved) as { scrollTop?: unknown } : null;
    return typeof parsed?.scrollTop === 'number' ? parsed.scrollTop : 0;
  } catch {
    return 0;
  }
}

function readLastChapter(userId: string, bookId: string) {
  try {
    const saved = localStorage.getItem(readerPositionKey(userId, bookId));
    const parsed = saved ? JSON.parse(saved) as { chapterId?: unknown } : null;
    return typeof parsed?.chapterId === 'string' ? parsed.chapterId : null;
  } catch {
    return null;
  }
}

function readLastReadAt(userId: string, bookId: string) {
  try {
    const saved = localStorage.getItem(readerPositionKey(userId, bookId));
    const parsed = saved ? JSON.parse(saved) as { updatedAt?: unknown } : null;
    return typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 0;
  } catch {
    return 0;
  }
}

function hasCompletedBook(userId: string, bookId: string) {
  return localStorage.getItem(readerCompletedKey(userId, bookId)) === 'true';
}

function coverOverrideKey(userId: string) {
  return `book-cover-overrides:${userId}`;
}

function shelfCoverOverrideKey(userId: string) {
  return `shelf-cover-overrides:${userId}`;
}

async function prepareCoverImage(file: File) {
  const image = await createImageBitmap(file);
  const targetWidth = 1200;
  const targetHeight = 1800;
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể xử lý ảnh bìa.');

  const sourceRatio = image.width / image.height;
  const targetRatio = targetWidth / targetHeight;
  const sourceWidth = sourceRatio > targetRatio ? image.height * targetRatio : image.width;
  const sourceHeight = sourceRatio > targetRatio ? image.height : image.width / targetRatio;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) throw new Error('Không thể tạo ảnh bìa.');
  return new File([blob], 'cover.jpg', { type: 'image/jpeg' });
}

async function getBookFileUrl(path: string) {
  const { data, error } = await supabase.storage.from('books').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error || new Error('Không thể tạo URL đọc tệp.');
  return data.signedUrl;
}

const fontSizes: Record<FontSize, string> = {
  small: '1rem',
  medium: '1.125rem',
  large: '1.375rem',
};

function normalizeBookMetadata(book: Book): Book {
  const hasUnknownAuthor = book.author === 'Unknown author' || book.author === 'Không rõ tác giả';
  if (!hasUnknownAuthor || !book.title.includes(' - ')) {
    return hasUnknownAuthor ? { ...book, author: 'Không rõ tác giả' } : book;
  }
  const [titlePart, ...authorParts] = book.title.split(/\s+-\s+/);
  const author = authorParts.join(' - ').trim();
  if (!titlePart.trim() || !author) return book;
  return { ...book, title: titlePart.trim(), author };
}

function sortBooksByTitle(bookList: Book[]) {
  return [...bookList].sort((left, right) =>
    left.title.localeCompare(right.title, 'vi', { numeric: true, sensitivity: 'base' }),
  );
}

function getShelfName(book: Book) {
  if (book.author.trim() && book.author !== 'Không rõ tác giả') return book.author.trim();
  const seriesName = book.title
    .replace(/\s*[-_:|]\s*(?:vol(?:ume)?|tập|tap|quyển|quyen)?\s*\d+.*$/i, '')
    .replace(/\s+(?:vol(?:ume)?|tập|tap|quyển|quyen)\s*\d+.*$/i, '')
    .trim();
  return seriesName || 'Kho chưa phân loại';
}

function bookDuplicateKey(title: string, author: string) {
  return `${title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')}::${author.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')}`;
}

function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (isSignUp && !result.data.session) setMessage('Hãy kiểm tra email để xác nhận tài khoản.');
  };

  return (
    <div className="min-h-screen bg-stone-50 px-6 py-16 text-stone-800">
      <form onSubmit={submit} className="mx-auto max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-stone-600" />
          <h1 className="text-xl font-semibold">Đọc sách</h1>
        </div>
        <h2 className="mb-1 text-lg font-semibold">{isSignUp ? 'Tạo tài khoản' : 'Đăng nhập'}</h2>
        <p className="mb-5 text-sm text-stone-500">Thư viện của bạn sẽ đồng bộ trên các thiết bị.</p>
        <label className="mb-4 block text-sm">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-500"
          />
        </label>
        <label className="mb-4 block text-sm">
          Mật khẩu
          <input
            type="password"
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-500"
          />
        </label>
        {message && <p className="mb-4 text-sm text-red-600">{message}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Đang xử lý...' : isSignUp ? 'Đăng ký' : 'Đăng nhập'}
        </button>
        <button type="button" onClick={() => { setIsSignUp(!isSignUp); setMessage(null); }} className="mt-4 w-full text-sm text-stone-600 hover:text-stone-900">
          {isSignUp ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </button>
      </form>
    </div>
  );
}

function LibraryBookCard({
  book,
  coverUrl,
  onOpen,
  onContextMenu,
  fullWidth = false,
  isDark = false,
}: {
  book: Book;
  coverUrl?: string;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  fullWidth?: boolean;
  isDark?: boolean;
}) {
  return (
    <button
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={`group text-left ${fullWidth ? 'w-full' : 'w-36 shrink-0 sm:w-44'}`}
    >
      {coverUrl ? (
        <div className="mb-3 aspect-[3/4] w-full overflow-hidden rounded-xl shadow-sm transition-transform group-hover:-translate-y-1">
          <img
            src={coverUrl}
            alt={`Cover ${book.title}`}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          className="mb-3 flex aspect-[3/4] items-end rounded-xl p-3 shadow-sm transition-transform group-hover:-translate-y-1"
          style={{ backgroundColor: book.cover_color }}
        >
          <BookOpen className="h-8 w-8 text-white/90" />
        </div>
      )}
      <h3 className={`min-h-10 line-clamp-2 text-sm font-semibold leading-5 ${isDark ? 'text-stone-100 group-hover:text-stone-300' : 'text-stone-800 group-hover:text-stone-600'}`}>
        {book.title}
      </h3>
      <p className={`mt-1 min-h-4 truncate text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>{book.author}</p>
    </button>
  );
}

function RenameDialog({
  value,
  label,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-stone-900">{label}</h2>
        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-4 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-stone-600"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Hủy
          </button>
          <button type="submit" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
            Lưu
          </button>
        </div>
      </form>
    </div>
  );
}

function ShareDialog({
  email,
  onEmailChange,
  itemLabel,
  busy,
  result,
  onCancel,
  onSubmit,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  itemLabel: string;
  busy: boolean;
  result: { sentCount: number; duplicateTitles: string[] } | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-stone-900">Gửi {itemLabel}</h2>
        <p className="mt-1 text-sm text-stone-500">Nhập email tài khoản nhận sách.</p>
        {!result ? (
          <>
            <input
              autoFocus
              type="email"
              required
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="email@example.com"
              className="mt-4 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-stone-600"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Hủy</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">
                {busy ? 'Đang gửi...' : 'Gửi sách'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
              <p>Đã gửi {result.sentCount} sách.</p>
              {result.duplicateTitles.length > 0 && <p className="mt-2 text-amber-700">Tài khoản nhận đã có: {result.duplicateTitles.join(', ')}.</p>}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onCancel} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Đóng</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function DeleteDialog({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
        <p className="mt-2 text-sm text-stone-600">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
            Hủy
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

async function renderPdfCanvas(page: pdfjsLib.PDFPageProxy, canvas: HTMLCanvasElement, scale: number) {
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
}

function PdfReader({
  url,
  fileName,
  positionKey,
  pageNumber,
  pageCount,
  onPageChange,
  isDark,
}: {
  url: string;
  fileName: string;
  positionKey: string;
  pageNumber: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  isDark: boolean;
}) {
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const pageStageRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1.5);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ url, wasmUrl: pdfWasmUrl });
    void loadingTask.promise.then((document) => {
      if (!cancelled) setPdf(document);
    }).catch(() => {
      if (!cancelled) setRenderError(true);
    });
    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf || !pageCanvasRef.current) return;
    let cancelled = false;
    void pdf.getPage(pageNumber).then((page) => {
      if (!cancelled && pageCanvasRef.current) {
        return renderPdfCanvas(page, pageCanvasRef.current, scale).then(() => {
          const savedScrollTop = Number(
            localStorage.getItem(`${positionKey}:pdf-page:${pageNumber}`) || 0,
          );
          if (!cancelled && pageStageRef.current) {
            pageStageRef.current.scrollTop = Number.isFinite(savedScrollTop) ? savedScrollTop : 0;
          }
        });
      }
      return undefined;
    }).catch(() => {
      if (!cancelled) setRenderError(true);
    });
    return () => { cancelled = true; };
  }, [pageNumber, pdf, positionKey, scale]);

  useEffect(() => {
    const stage = pageStageRef.current;
    if (!stage) return;
    const storageKey = `${positionKey}:pdf-page:${pageNumber}`;
    const savedScrollTop = Number(localStorage.getItem(storageKey) || 0);
    stage.scrollTop = Number.isFinite(savedScrollTop) ? savedScrollTop : 0;
    const saveScrollPosition = () => {
      localStorage.setItem(storageKey, String(stage.scrollTop));
    };
    stage.addEventListener('scroll', saveScrollPosition, { passive: true });
    return () => {
      saveScrollPosition();
      stage.removeEventListener('scroll', saveScrollPosition);
    };
  }, [pageNumber, positionKey]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const renderThumbnails = async () => {
      for (let index = 1; index <= Math.min(pdf.numPages, 30); index += 1) {
        const canvas = thumbnailRefs.current[index];
        if (!canvas) continue;
        const page = await pdf.getPage(index);
        if (cancelled) return;
        await renderPdfCanvas(page, canvas, 0.16);
      }
    };
    void renderThumbnails();
    return () => { cancelled = true; };
  }, [pdf]);

  if (renderError) return <p className="p-8">Không thể hiển thị PDF này.</p>;
  return (
    <div className={`pdf-reader ${isDark ? 'pdf-reader-dark' : ''}`}>
      <div className="pdf-toolbar">
        <span className="pdf-file-name" title={fileName}>{fileName}</span>
        <div className="pdf-toolbar-group">
          <button onClick={() => onPageChange(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1} aria-label="Trang trước" title="Trang trước">
            <ChevronLeft />
          </button>
          <span className="pdf-page-counter">{pageNumber} / {pageCount}</span>
          <button onClick={() => onPageChange(Math.min(pageCount, pageNumber + 1))} disabled={pageNumber >= pageCount} aria-label="Trang sau" title="Trang sau">
            <ChevronRight />
          </button>
        </div>
        <div className="pdf-toolbar-group">
          <button onClick={() => setScale((value) => Math.max(0.5, value - 0.1))} aria-label="Thu nhỏ" title="Thu nhỏ"><ZoomOut /></button>
          <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((value) => Math.min(2, value + 0.1))} aria-label="Phóng to" title="Phóng to"><ZoomIn /></button>
          <button onClick={() => setScale(1.5)} aria-label="Vừa chiều rộng trang" title="Vừa chiều rộng trang"><RotateCw /></button>
          <a href={url} download aria-label="Tải PDF xuống" title="Tải PDF xuống"><Download /></a>
        </div>
      </div>
      <div className="pdf-reader-body">
        <aside className="pdf-thumbnails scrollbar-thin">
          {Array.from({ length: Math.min(pageCount, 30) }, (_, index) => index + 1).map((index) => (
            <button
              key={index}
              onClick={() => onPageChange(index)}
              className={index === pageNumber ? 'pdf-thumbnail-active' : ''}
              aria-label={`Mở trang ${index}`}
            >
              <canvas ref={(canvas) => { thumbnailRefs.current[index] = canvas; }} />
              <span>{index}</span>
            </button>
          ))}
          {pageCount > 30 && <p>... còn {pageCount - 30} trang</p>}
        </aside>
        <div
          ref={pageStageRef}
          className="pdf-page-stage scrollbar-thin"
          onClick={(event) => {
            if (event.target !== event.currentTarget && event.target !== pageCanvasRef.current) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const isLeftSide = event.clientX < bounds.left + bounds.width * 0.35;
            const isRightSide = event.clientX > bounds.left + bounds.width * 0.65;
            if (isLeftSide) onPageChange(Math.max(1, pageNumber - 1));
            if (isRightSide) onPageChange(Math.min(pageCount, pageNumber + 1));
          }}
        >
          <canvas ref={pageCanvasRef} aria-label={`Trang ${pageNumber}`} />
        </div>
      </div>
    </div>
  );
}

function resolveZipPath(basePath: string, relativePath: string) {
  const parts = `${basePath}/${relativePath}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

async function extractEpubChapters(url: string, bookId: string): Promise<Chapter[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không thể tải tệp EPUB.');

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('EPUB không có tệp container.');

  const container = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootFile) throw new Error('EPUB không có tệp package.');

  const packageXml = await zip.file(rootFile)?.async('string');
  if (!packageXml) throw new Error('EPUB bị thiếu tệp package.');

  const packageDocument = new DOMParser().parseFromString(packageXml, 'application/xml');
  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  packageDocument.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type');
    if (id && href && mediaType) {
      manifest.set(id, { href, mediaType, properties: item.getAttribute('properties') || '' });
    }
  });

  const getZipPath = (documentPath: string, href: string) =>
    resolveZipPath(
      documentPath.includes('/') ? documentPath.slice(0, documentPath.lastIndexOf('/')) : '',
      decodeURIComponent(href.split('#')[0]),
    );

  const spineItems = Array.from(packageDocument.querySelectorAll('spine itemref'))
    .map((itemRef) => {
      const item = manifest.get(itemRef.getAttribute('idref') || '');
      return item ? { item, path: getZipPath(rootFile, item.href) } : null;
    })
    .filter((entry): entry is { item: { href: string; mediaType: string; properties: string }; path: string } => Boolean(entry));

  const getFilenameChapterTitle = (path: string) => {
    const filename = path.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
    const normalizedFilename = filename.replace(/[\s_-]+/g, '').toLowerCase();
    const chapterMatch = filename.match(/^(?:chuong|c)[-_ ]?(\d+)\b/i);
    if (chapterMatch) return `Chương ${Number(chapterMatch[1])}`;
    const sideStoryMatch = normalizedFilename.match(/^(?:nt|ngoaitruyen|extrachapter|sidestory)(\d*)$/i);
    if (sideStoryMatch) {
      return sideStoryMatch[1] ? `Ngoại truyện ${Number(sideStoryMatch[1])}` : 'Ngoại truyện';
    }
    if (/^(?:modau|opening|prologue|loinoidau)$/i.test(normalizedFilename)) return 'Mở đầu';
    if (/^(?:phuluc|appendix)(\d*)$/i.test(normalizedFilename)) return 'Phụ lục';
    return null;
  };

  const htmlItems = spineItems.filter(({ item }) => item.mediaType.includes('html') || item.mediaType.includes('xml'));
  const namedChapterCount = htmlItems.filter(({ path }) => getFilenameChapterTitle(path)).length;
  const chapterGroups: { title: string; items: typeof htmlItems }[] = [];
  if (namedChapterCount > 0) {
    for (const item of htmlItems) {
      const title = getFilenameChapterTitle(item.path);
      if (title) {
        chapterGroups.push({ title, items: [item] });
      } else if (chapterGroups.length === 0) {
        chapterGroups.push({ title: 'Hình minh họa', items: [item] });
      } else {
        chapterGroups[chapterGroups.length - 1].items.push(item);
      }
    }
  } else {
    htmlItems.forEach((item) => chapterGroups.push({ title: '', items: [item] }));
  }

  const manifestByPath = new Map<string, { mediaType: string }>();
  manifest.forEach((item) => manifestByPath.set(getZipPath(rootFile, item.href), item));

  async function readXhtml(path: string) {
    const source = await zip.file(path)?.async('string');
    if (!source) return null;

    const document = new DOMParser().parseFromString(source, 'text/html');
    document.querySelectorAll('script, style, iframe, object, embed').forEach((element) => element.remove());
    document.querySelectorAll<HTMLElement>('*').forEach((element) => {
      Array.from(element.attributes)
        .filter((attribute) => attribute.name.toLowerCase().startsWith('on'))
        .forEach((attribute) => element.removeAttribute(attribute.name));
    });

    for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('img[src]'))) {
      const imageSource = image.getAttribute('src');
      if (!imageSource) continue;
      image.removeAttribute('width');
      image.removeAttribute('height');
      image.style.removeProperty('width');
      image.style.removeProperty('height');
      image.style.maxWidth = '100%';
      image.style.height = 'auto';
      if (imageSource.startsWith('data:')) continue;
      const rawImagePath = decodeURIComponent(imageSource.split('#')[0].split('?')[0]);
      const imageDirectory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const imagePathCandidates = [
        resolveZipPath(imageDirectory, rawImagePath),
        `${imageDirectory}/${rawImagePath}`.replace(/^\/+/, ''),
        rawImagePath.replace(/^\.\.\//, ''),
      ];
      const imagePath = imagePathCandidates.find((candidate) => Boolean(zip.file(candidate)));
      if (!imagePath) {
        image.remove();
        continue;
      }
      const imageFile = zip.file(imagePath);
      if (!imageFile) {
        image.remove();
        continue;
      }
      const imageBlob = await imageFile.async('blob');
      const mediaType = manifestByPath.get(imagePath)?.mediaType || imageBlob.type || 'image/jpeg';
      image.src = URL.createObjectURL(new Blob([imageBlob], { type: mediaType }));
    }

    for (const image of Array.from(document.querySelectorAll<SVGImageElement>('svg image'))) {
      const imageSource = image.getAttribute('href') || image.getAttribute('xlink:href');
      if (!imageSource || imageSource.startsWith('data:')) continue;
      const rawImagePath = decodeURIComponent(imageSource.split('#')[0].split('?')[0]);
      const imageDirectory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const imagePath = [
        resolveZipPath(imageDirectory, rawImagePath),
        `${imageDirectory}/${rawImagePath}`.replace(/^\/+/, ''),
        rawImagePath.replace(/^\.\.\//, ''),
      ].find((candidate) => Boolean(zip.file(candidate)));
      if (!imagePath) {
        image.remove();
        continue;
      }
      const imageFile = zip.file(imagePath);
      if (!imageFile) {
        image.remove();
        continue;
      }
      const imageBlob = await imageFile.async('blob');
      const mediaType = manifestByPath.get(imagePath)?.mediaType || imageBlob.type || 'image/png';
      const imageUrl = URL.createObjectURL(new Blob([imageBlob], { type: mediaType }));
      image.setAttribute('href', imageUrl);
      image.removeAttribute('xlink:href');
    }

    const bodyHtml = document.body?.innerHTML || '';
    const extraHeading = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, li, blockquote')).find(
      (element) => /^ngoại truyện\s*:?[\s]*$/i.test(element.textContent?.replace(/\s+/g, ' ').trim() || ''),
    );
    const splitAt = extraHeading ? bodyHtml.indexOf(extraHeading.outerHTML) : -1;
    const rawSegments = splitAt > 0
      ? [bodyHtml.slice(0, splitAt), bodyHtml.slice(splitAt)]
      : [bodyHtml];
    const segments = rawSegments
      .map((html, index) => {
        const segmentDocument = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
        return {
          html,
          text: segmentDocument.body.textContent?.replace(/\s+/g, ' ').trim() || '',
          hasImage: segmentDocument.querySelectorAll('img, svg image').length > 0,
          title: index === 1 && splitAt > 0 ? 'Ngoại truyện' : null,
        };
      })
      .filter((segment) => segment.text || segment.hasImage);
    const text = segments.map((segment) => segment.text).join(' ').trim();
    const hasImage = document.querySelectorAll('img, svg image').length > 0;
    return { html: bodyHtml, text, hasImage, segments };
  }

  const chapters: Chapter[] = [];
  for (const group of chapterGroups) {
    const parts = (await Promise.all(group.items.map((item) => readXhtml(item.path)))).filter(
      (part): part is {
        html: string;
        text: string;
        hasImage: boolean;
        segments: { html: string; text: string; hasImage: boolean; title: string | null }[];
      } => Boolean(part),
    );
    if (group.title === 'Hình minh họa' && !parts.some((part) => part.hasImage)) continue;
    const contentSegments: { title: string; html: string[]; text: string[]; hasImage: boolean }[] = [];
    for (const part of parts) {
      for (const segment of part.segments) {
        const currentIndex = contentSegments.length - 1;
        const current = currentIndex >= 0 ? contentSegments[currentIndex] : undefined;
        const title = segment.title || current?.title || group.title || `Chương ${chapters.length + 1}`;
        if (segment.title && current && current.title !== segment.title) {
          contentSegments.push({ title: segment.title, html: [segment.html], text: [segment.text], hasImage: segment.hasImage });
        } else if (current && current.title === title) {
          current.html.push(segment.html);
          current.text.push(segment.text);
          current.hasImage ||= segment.hasImage;
        } else {
          contentSegments.push({ title, html: [segment.html], text: [segment.text], hasImage: segment.hasImage });
        }
      }
    }

    for (const segment of contentSegments) {
      const content = segment.text.filter(Boolean).join('\n\n').trim();
      const contentHtml = segment.html.map((html) => `<section class="epub-file">${html}</section>`).join('');
      if (!content && !contentHtml) continue;
      chapters.push({
        id: `${bookId}-epub-${chapters.length}`,
        book_id: bookId,
        title: segment.title,
        content,
        content_html: contentHtml,
        chapter_number: chapters.length + 1,
        created_at: new Date().toISOString(),
      });
    }
  }

  if (chapters.length === 0) throw new Error('EPUB không có chương văn bản để đọc.');
  return chapters;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

async function extractPdfChapters(url: string, bookId: string): Promise<Chapter[]> {
  const loadingTask = pdfjsLib.getDocument({ url, wasmUrl: pdfWasmUrl });
  const pdf = await loadingTask.promise;
  const chapters: Chapter[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = '';

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str) continue;
      currentLine += item.str;
      if ('hasEOL' in item && item.hasEOL) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    const content = lines.filter(Boolean).join('\n\n').trim();
    const hasReadableText = content.replace(/\s/g, '').length >= 80;
    if (!content && !textContent.items.length) {
      chapters.push({
        id: `${bookId}-pdf-${pageNumber}`,
        book_id: bookId,
        title: `Trang ${pageNumber}`,
        content: '',
        pdf_url: url,
        pdf_page_number: pageNumber,
        chapter_number: pageNumber,
        created_at: new Date().toISOString(),
      });
      continue;
    }
    const contentHtml = lines
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('');
    chapters.push({
      id: `${bookId}-pdf-${pageNumber}`,
      book_id: bookId,
      title: `Trang ${pageNumber}`,
      content: hasReadableText ? content : '',
      content_html: hasReadableText ? contentHtml : undefined,
      pdf_url: url,
      pdf_page_number: pageNumber,
      chapter_number: pageNumber,
      created_at: new Date().toISOString(),
    });
  }

  if (chapters.length === 0) throw new Error('PDF này không có trang để hiển thị.');
  return chapters;
}

async function loadStoredChapters(bookId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('book_id', bookId)
    .order('chapter_number');
  if (error) throw error;
  return data || [];
}

async function extractEpubCoverUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) return null;
  const container = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootFile) return null;
  const packageXml = await zip.file(rootFile)?.async('string');
  if (!packageXml) return null;
  const packageDocument = new DOMParser().parseFromString(packageXml, 'application/xml');
  const packageDirectory = rootFile.includes('/') ? rootFile.slice(0, rootFile.lastIndexOf('/')) : '';
  const candidates: string[] = [];
  packageDocument.querySelectorAll('manifest item').forEach((item) => {
    const properties = item.getAttribute('properties') || '';
    const mediaType = item.getAttribute('media-type') || '';
    const href = item.getAttribute('href');
    if (href && properties.split(/\s+/).includes('cover-image')) candidates.unshift(href);
    if (href && mediaType.startsWith('image/')) candidates.push(href);
  });
  for (const href of candidates) {
    const imagePath = resolveZipPath(packageDirectory, decodeURIComponent(href.split('#')[0]));
    const imageFile = zip.file(imagePath);
    if (!imageFile) continue;
    return URL.createObjectURL(await imageFile.async('blob'));
  }
  return null;
}

async function extractPdfCoverUrl(url: string) {
  const loadingTask = pdfjsLib.getDocument({ url, wasmUrl: pdfWasmUrl });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const canvas = document.createElement('canvas');
    await renderPdfCanvas(page, canvas, 0.8);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    void loadingTask.destroy();
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [readerOpen, setReaderOpen] = useState(false);
  const [selectedShelfKey, setSelectedShelfKey] = useState<string | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [books, setBooks] = useState<Book[]>([]);
  const [cloudProgress, setCloudProgress] = useState<Record<string, CloudReadingProgress>>({});
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [openShelves, setOpenShelves] = useState<Record<string, boolean>>({});
  const [shelfRenames, setShelfRenames] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('');
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{
    type: 'book' | 'shelf';
    value: string;
    book?: Book;
    shelfKey?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: 'book' | 'shelf';
    book?: Book;
    fromContinueReading?: boolean;
    shelfKey?: string;
    shelfName?: string;
    shelfBooks?: Book[];
    x: number;
    y: number;
  } | null>(null);
  const [shareDialog, setShareDialog] = useState<{
    books: Book[];
    email: string;
    busy: boolean;
    result: { sentCount: number; duplicateTitles: string[] } | null;
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<
    | { type: 'book'; book: Book }
    | { type: 'books'; books: Book[] }
    | { type: 'shelf'; shelfName: string; shelfBooks: Book[] }
    | null
  >(null);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [, setContinueReadingRevision] = useState(0);
  const [coverTarget, setCoverTarget] = useState<{ type: 'book' | 'shelf'; id: string } | null>(null);
  const [shelfCoverOverrides, setShelfCoverOverrides] = useState<Record<string, string>>({});
  const [scrollProgress, setScrollProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const initialPositionRef = useRef<ReadingPosition | null>(null);
  const selectionRequestRef = useRef(0);
  const suppressScrollSaveRef = useRef(false);
  const progressSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<ReadingProgressPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user ?? null);
        setAuthLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('reader-theme') as Theme | null;
    if (saved) setTheme(saved);
    const savedFont = localStorage.getItem('reader-font-size') as FontSize | null;
    if (savedFont) setFontSize(savedFont);
    try {
      const savedShelves = localStorage.getItem('reader-shelf-names');
      if (savedShelves) setShelfRenames(JSON.parse(savedShelves) as Record<string, string>);
      const savedShelfCovers = localStorage.getItem(shelfCoverOverrideKey(user?.id || ''));
      if (savedShelfCovers) setShelfCoverOverrides(JSON.parse(savedShelfCovers) as Record<string, string>);
    } catch {
      setShelfRenames({});
      setShelfCoverOverrides({});
    }
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem('reader-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('reader-font-size', fontSize);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('reader-shelf-names', JSON.stringify(shelfRenames));
  }, [shelfRenames]);

  useEffect(() => {
    if (user?.id) localStorage.setItem(shelfCoverOverrideKey(user.id), JSON.stringify(shelfCoverOverrides));
  }, [shelfCoverOverrides, user?.id]);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];
    const localCoverOverrides: Record<string, string> = user
      ? JSON.parse(localStorage.getItem(coverOverrideKey(user.id)) || '{}') as Record<string, string>
      : {};
    void (async () => {
      const entries: [string, string | null][] = [];
      const coverBooks = books.filter((libraryBook) =>
        libraryBook.cover_path || (libraryBook.file_path && (libraryBook.file_type === 'epub' || libraryBook.file_type === 'pdf')),
      );
      let nextIndex = 0;
      const loadNextCover = async () => {
        while (active) {
          const index = nextIndex;
          nextIndex += 1;
          const libraryBook = coverBooks[index];
          if (!libraryBook) return;
          try {
            const url = libraryBook.cover_path
              ? await getBookFileUrl(libraryBook.cover_path)
              : libraryBook.file_type === 'pdf'
              ? await extractPdfCoverUrl(
                await getBookFileUrl(libraryBook.file_path!),
              )
              : await extractEpubCoverUrl(
                await getBookFileUrl(libraryBook.file_path!),
              );
            if (url) objectUrls.push(url);
            entries.push([libraryBook.id, url]);
            if (active && url) {
              setCoverUrls((current) => ({ ...current, [libraryBook.id]: url }));
            }
          } catch {
            entries.push([libraryBook.id, null]);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, coverBooks.length) }, () => loadNextCover()));
      if (active) {
        setCoverUrls({
          ...Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))),
          ...localCoverOverrides,
        });
      }
    })();
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [books, user]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      selectionRequestRef.current += 1;
      initialPositionRef.current = null;
      setReaderOpen(false);
      setSelectedShelfKey(null);
      setBooks([]);
      setCloudProgress({});
      setBook(null);
      setChapters([]);
      setLoading(false);
      return;
    }
    const currentUserId = userId;

    void supabase
      .from('reading_progress')
      .select('book_id, chapter_id, scroll_top, completed, updated_at')
      .eq('user_id', currentUserId)
      .then(({ data, error: progressError }) => {
        if (progressError) {
          setError(`Không thể tải tiến độ đọc: ${progressError.message}`);
          return;
        }
        const nextProgress: Record<string, CloudReadingProgress> = {};
        (data || []).forEach((item) => {
          nextProgress[item.book_id] = {
            chapterId: item.chapter_id,
            scrollTop: item.scroll_top,
            updatedAt: new Date(item.updated_at).getTime(),
            completed: item.completed,
          };
        });
        setCloudProgress(nextProgress);
      });

    async function loadData() {
      const requestId = ++selectionRequestRef.current;
      try {
        const { data: bookData, error: bookError } = await supabase
          .from('books')
          .select('*')
          .order('created_at', { ascending: false });

        if (bookError) throw bookError;
        if (requestId !== selectionRequestRef.current) return;
        if (!bookData || bookData.length === 0) {
          setBooks([]);
          setBook(null);
          setLoading(false);
          return;
        }

        const normalizedBooks = sortBooksByTitle(bookData.map(normalizeBookMetadata));
        setBooks(normalizedBooks);
        setBook(normalizedBooks[0]);

        try {
          const lastChapterId = readLastChapter(currentUserId, normalizedBooks[0].id);
          initialPositionRef.current = lastChapterId
            ? { chapterId: lastChapterId, scrollTop: 0 }
            : null;
        } catch {
          initialPositionRef.current = null;
        }

        const loadedChapters =
          normalizedBooks[0].file_type === 'epub' && normalizedBooks[0].file_path
            ? await extractEpubChapters(
                await getBookFileUrl(normalizedBooks[0].file_path),
                normalizedBooks[0].id,
              )
            : normalizedBooks[0].file_type === 'pdf' && normalizedBooks[0].file_path
              ? await extractPdfChapters(
                  await getBookFileUrl(normalizedBooks[0].file_path),
                  normalizedBooks[0].id,
                )
            : await loadStoredChapters(normalizedBooks[0].id);
            if (requestId !== selectionRequestRef.current) return;
        setChapters(loadedChapters);
        const savedChapterIndex = loadedChapters.findIndex(
          (chapter) => chapter.id === initialPositionRef.current?.chapterId,
        );
        if (savedChapterIndex >= 0) {
          const chapterPosition = readChapterPosition(currentUserId, loadedChapters[savedChapterIndex]);
          if (chapterPosition) initialPositionRef.current = chapterPosition;
          setCurrentChapterIndex(savedChapterIndex);
        }
        setLoading(false);
      } catch (err) {
        if (requestId !== selectionRequestRef.current) return;
        setError(err instanceof Error ? err.message : 'Không thể tải sách.');
        setLoading(false);
      }
    }
    loadData();
  }, [user?.id]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const selectBook = useCallback(async (selectedBook: Book) => {
    const requestId = ++selectionRequestRef.current;
    setError(null);
    setBook(selectedBook);
    setChapters([]);
    setScrollProgress(0);
    setSidebarOpen(false);

    let savedPosition: ReadingPosition | null = null;
    try {
      const cloudPosition = user ? cloudProgress[selectedBook.id] : undefined;
      const lastChapterId = cloudPosition?.chapterId || (user ? readLastChapter(user.id, selectedBook.id) : null);
      savedPosition = lastChapterId
        ? {
          chapterId: lastChapterId,
          scrollTop: cloudPosition
            ? cloudPosition.scrollTop
            : readChapterScrollTop(user!.id, selectedBook.id, lastChapterId),
        }
        : null;
    } catch {
      savedPosition = null;
    }
    initialPositionRef.current = savedPosition;

    try {
      setLoading(true);
      const loadedChapters =
        selectedBook.file_type === 'epub' && selectedBook.file_path
          ? await extractEpubChapters(
              await getBookFileUrl(selectedBook.file_path),
              selectedBook.id,
            )
          : selectedBook.file_type === 'pdf' && selectedBook.file_path
            ? await extractPdfChapters(
                await getBookFileUrl(selectedBook.file_path),
                selectedBook.id,
              )
          : selectedBook.file_path
            ? []
            : await loadStoredChapters(selectedBook.id);
          if (requestId !== selectionRequestRef.current) return;
      setChapters(loadedChapters);
      const savedChapterIndex = loadedChapters.findIndex(
        (chapter) => chapter.id === savedPosition?.chapterId,
      );
      if (savedChapterIndex >= 0 && user) {
        const chapterPosition = readChapterPosition(user.id, loadedChapters[savedChapterIndex]);
        initialPositionRef.current = chapterPosition || { chapterId: loadedChapters[savedChapterIndex].id, scrollTop: 0 };
      } else {
        initialPositionRef.current = null;
      }
      setCurrentChapterIndex(savedChapterIndex >= 0 ? savedChapterIndex : 0);
    } catch (err) {
      if (requestId !== selectionRequestRef.current) return;
      setError(err instanceof Error ? err.message : 'Không thể đọc sách.');
      setCurrentChapterIndex(0);
    } finally {
      if (requestId === selectionRequestRef.current) setLoading(false);
    }
  }, [cloudProgress, user]);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const invalidFile = files.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return (extension !== 'pdf' && extension !== 'epub') || file.size > 100 * 1024 * 1024;
    });
    if (invalidFile) {
      setError(`${invalidFile.name}: chỉ hỗ trợ PDF/EPUB dưới 100 MB.`);
      return;
    }

    setLoading(true);
    setError(null);
    setUploadNotice(null);
    try {
      if (!user) throw new Error('Vui lòng đăng nhập trước khi tải sách lên.');
      const { data: existingBooks, error: existingBooksError } = await supabase
        .from('books')
        .select('title, author')
        .eq('owner_id', user.id);
      if (existingBooksError) throw existingBooksError;

      const existingKeys = new Set(
        (existingBooks || []).map((existingBook) => bookDuplicateKey(existingBook.title, existingBook.author)),
      );
      const duplicateTitles: string[] = [];
      const uploadCandidates = files.filter((file) => {
        const fileLabel = file.name.replace(/\.(pdf|epub)$/i, '').trim() || 'Sách chưa đặt tên';
        const [titlePart, ...authorParts] = fileLabel.split(/\s+-\s+/);
        const title = titlePart.trim() || fileLabel;
        const author = authorParts.join(' - ').trim() || 'Không rõ tác giả';
        const key = bookDuplicateKey(title, author);
        if (existingKeys.has(key)) {
          duplicateTitles.push(title);
          return false;
        }
        existingKeys.add(key);
        return true;
      });

      if (uploadCandidates.length === 0) {
        setUploadNotice(`Sách đã có trong thư viện: ${duplicateTitles.join(', ')}.`);
        return;
      }
      const uploadedBooks = await Promise.all(uploadCandidates.map(async (file) => {
        const extension = file.name.split('.').pop()?.toLowerCase() as 'pdf' | 'epub';
        const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('books').upload(filePath, file, {
          contentType: file.type || (extension === 'pdf' ? 'application/pdf' : 'application/epub+zip'),
          upsert: false,
        });
        if (uploadError) throw uploadError;

        const fileLabel = file.name.replace(/\.(pdf|epub)$/i, '').trim() || 'Sách chưa đặt tên';
        const [titlePart, ...authorParts] = fileLabel.split(/\s+-\s+/);
        const title = titlePart.trim() || fileLabel;
        const author = authorParts.join(' - ').trim() || 'Không rõ tác giả';
        const { data: newBook, error: insertError } = await supabase
          .from('books')
            .insert({
              title,
              author,
              file_path: filePath,
              file_type: extension,
              owner_id: user.id,
              is_public: false,
            })
          .select('*')
          .single();
        if (insertError) throw insertError;
        return newBook;
      }));

      const normalizedNewBooks = uploadedBooks.map(normalizeBookMetadata);
      setBooks((currentBooks) => sortBooksByTitle([...normalizedNewBooks, ...currentBooks]));
      const uploadedShelfKeys = new Set(
        normalizedNewBooks.map((newBook) => getShelfName(newBook).toLocaleLowerCase('vi')),
      );
      if (selectedShelfKey && (!uploadedShelfKeys.has(selectedShelfKey) || uploadedShelfKeys.size > 1)) {
        setSelectedShelfKey(null);
      }
      await selectBook(normalizedNewBooks[0]);
      if (duplicateTitles.length > 0) {
        setUploadNotice(`Đã bỏ qua sách đã có: ${duplicateTitles.join(', ')}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải sách lên.');
    } finally {
      setLoading(false);
    }
  }, [selectBook, selectedShelfKey, user]);

  const handleShare = useCallback(async () => {
    if (!shareDialog || !shareDialog.email.trim() || shareDialog.books.length === 0) return;
    setShareDialog((current) => current ? { ...current, busy: true } : current);
    setError(null);
    const { data, error: shareError } = await supabase.rpc('send_books_to_email', {
      target_email: shareDialog.email.trim(),
      source_book_ids: shareDialog.books.map((item) => item.id),
    });
    if (shareError) {
      setError(shareError.message);
      setShareDialog((current) => current ? { ...current, busy: false } : current);
      return;
    }
    const shareResult = data as { sent_count?: number; duplicate_titles?: string[] };
    setShareDialog((current) => current ? {
      ...current,
      busy: false,
      result: {
        sentCount: shareResult.sent_count || 0,
        duplicateTitles: shareResult.duplicate_titles || [],
      },
    } : current);
  }, [shareDialog]);

  const renameShelf = useCallback((shelfKey: string, currentName: string) => {
    setRenameDialog({ type: 'shelf', shelfKey, value: currentName });
  }, []);

  const shelves = books.reduce<Map<string, { name: string; books: Book[] }>>((groups, libraryBook) => {
    const baseShelfName = getShelfName(libraryBook);
    const matchingShelf = Array.from(groups.entries()).find(([, shelf]) => {
      const firstBook = shelf.books[0];
      if (!firstBook || firstBook.author !== libraryBook.author) return false;
      const existingName = getShelfName(firstBook);
      const currentName = baseShelfName.toLocaleLowerCase('vi');
      const previousName = existingName.toLocaleLowerCase('vi');
      return currentName === previousName
        || currentName.startsWith(`${previousName} `)
        || previousName.startsWith(`${currentName} `);
    });
    const shelfKey = matchingShelf?.[0] || baseShelfName.toLocaleLowerCase('vi');
    const shelfName = shelfRenames[shelfKey] || matchingShelf?.[1].name || baseShelfName;
    const shelf = groups.get(shelfKey) || { name: shelfName, books: [] };
    shelf.books.push(libraryBook);
    groups.set(shelfKey, shelf);
    return groups;
  }, new Map());
  const sortedShelves = Array.from(shelves.entries()).sort((left, right) =>
    left[1].name.localeCompare(right[1].name, 'vi', { sensitivity: 'base' }),
  );
  const continueBooks = books
    .filter((libraryBook) => Boolean(
      user
      && (cloudProgress[libraryBook.id]?.chapterId || readLastChapter(user.id, libraryBook.id))
      && !cloudProgress[libraryBook.id]?.completed
      && !hasCompletedBook(user.id, libraryBook.id),
    ))
    .sort((left, right) => user
      ? (cloudProgress[right.id]?.updatedAt || readLastReadAt(user.id, right.id))
        - (cloudProgress[left.id]?.updatedAt || readLastReadAt(user.id, left.id))
      : 0);
  const featuredBook = books.find((libraryBook) =>
    /bạch\s*dạ\s*hành|bach\s*da\s*hanh/i.test(libraryBook.title),
  );
  const continueReadingBooks = continueBooks.length > 0 ? continueBooks : featuredBook ? [featuredBook] : [];
  const selectedShelf = sortedShelves.find(([shelfKey]) => shelfKey === selectedShelfKey)?.[1];
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase('vi');
  const searchResults = normalizedSearchQuery
    ? books.filter((libraryBook) => [
      libraryBook.title,
      libraryBook.author,
      getShelfName(libraryBook),
    ].some((value) => value.toLocaleLowerCase('vi').includes(normalizedSearchQuery)))
    : [];
  const submittedSearchResults = submittedSearchQuery
    ? books.filter((libraryBook) => [
      libraryBook.title,
      libraryBook.author,
      getShelfName(libraryBook),
    ].some((value) => value.toLocaleLowerCase('vi').includes(submittedSearchQuery)))
    : [];

  const openBook = useCallback(async (selectedBook: Book) => {
    await selectBook(selectedBook);
    setReaderOpen(true);
  }, [selectBook]);

  const removeFromContinueReading = useCallback((bookToRemove: Book) => {
    if (!user) return;
    localStorage.removeItem(readerPositionKey(user.id, bookToRemove.id));
    const chapterPrefix = readerChapterPositionKey(user.id, bookToRemove.id, '');
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(chapterPrefix)) localStorage.removeItem(key);
    }
    void supabase
      .from('reading_progress')
      .delete()
      .eq('user_id', user.id)
      .eq('book_id', bookToRemove.id);
    setCloudProgress((current) => {
      const next = { ...current };
      delete next[bookToRemove.id];
      return next;
    });
    setContinueReadingRevision((revision) => revision + 1);
    setContextMenu(null);
  }, [user]);

  const handleDeleteBooks = useCallback(async (booksToDelete: Book[]) => {
    if (booksToDelete.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('books')
        .delete()
        .in('id', booksToDelete.map((item) => item.id));
      if (deleteError) throw deleteError;

      const deletedIds = new Set(booksToDelete.map((item) => item.id));
      const remainingBooks = books.filter((libraryBook) => !deletedIds.has(libraryBook.id));
      setBooks(remainingBooks);
      setSelectedBookIds((current) => {
        const next = new Set(current);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      if (book && deletedIds.has(book.id)) {
        if (remainingBooks[0]) {
          await selectBook(remainingBooks[0]);
        } else {
          setBook(null);
          setChapters([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa sách.');
    } finally {
      setLoading(false);
    }
  }, [book, books, selectBook]);

  const handleDelete = useCallback(async (bookToDelete: Book) => {
    await handleDeleteBooks([bookToDelete]);
  }, [handleDeleteBooks]);

  const handleRename = useCallback((bookToRename: Book) => {
    setRenameDialog({ type: 'book', book: bookToRename, value: bookToRename.title });
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameDialog) return;
    const nextName = renameDialog.value.trim();
    if (!nextName) {
      setRenameDialog(null);
      return;
    }
    if (renameDialog.type === 'shelf') {
      setShelfRenames((current) => ({ ...current, [renameDialog.shelfKey!]: nextName }));
      setRenameDialog(null);
      return;
    }
    const bookToRename = renameDialog.book!;
    if (nextName === bookToRename.title) {
      setRenameDialog(null);
      return;
    }
    const { data, error: updateError } = await supabase
      .from('books')
      .update({ title: nextName })
      .eq('id', bookToRename.id)
      .select('*')
      .single();
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const updatedBook = normalizeBookMetadata(data);
    setBooks((currentBooks) => currentBooks.map((item) => item.id === updatedBook.id ? updatedBook : item));
    if (book?.id === updatedBook.id) setBook(updatedBook);
    setRenameDialog(null);
  }, [book, renameDialog]);

  const handleDeleteShelf = useCallback(async (shelfName: string, shelfBooks: Book[]) => {
    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('books')
        .delete()
        .in('id', shelfBooks.map((item) => item.id));
      if (deleteError) throw deleteError;
      const deletedIds = new Set(shelfBooks.map((item) => item.id));
      setBooks((currentBooks) => currentBooks.filter((item) => !deletedIds.has(item.id)));
      if (book && deletedIds.has(book.id)) {
        setBook(null);
        setChapters([]);
        setReaderOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa thư mục.');
    } finally {
      setLoading(false);
    }
  }, [book]);

  const handleCoverUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const targetBook = coverTarget?.type === 'book'
      ? books.find((item) => item.id === coverTarget.id)
      : null;
    if (!file || !coverTarget || (coverTarget.type === 'book' && !targetBook) || !user) return;
    if (!file.type.startsWith('image/')) {
      setError('Ảnh bìa phải là tệp hình ảnh.');
      return;
    }
    let coverFile = file;
    try {
      coverFile = await prepareCoverImage(file);
      if (coverTarget.type === 'shelf') {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string' || !user) return;
          const currentOverrides = JSON.parse(
            localStorage.getItem(shelfCoverOverrideKey(user.id)) || '{}',
          ) as Record<string, string>;
          const nextOverrides = { ...currentOverrides, [coverTarget.id]: reader.result };
          localStorage.setItem(shelfCoverOverrideKey(user.id), JSON.stringify(nextOverrides));
          setShelfCoverOverrides(nextOverrides);
        };
        reader.readAsDataURL(coverFile);
        return;
      }
      const coverPath = `${user.id}/covers/${targetBook!.id}-${crypto.randomUUID()}`;
      const { error: uploadError } = await supabase.storage.from('books').upload(coverPath, coverFile, {
        contentType: coverFile.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error: updateError } = await supabase
        .from('books')
        .update({ cover_path: coverPath })
        .eq('id', targetBook!.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      const updatedBook = normalizeBookMetadata(data);
      setBooks((currentBooks) => currentBooks.map((item) => item.id === updatedBook.id ? updatedBook : item));
      const coverUrl = await getBookFileUrl(coverPath);
      setCoverUrls((current) => ({ ...current, [updatedBook.id]: coverUrl }));
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        const localCoverUrl = typeof reader.result === 'string' ? reader.result : null;
        if (!localCoverUrl || !user) return;
        const currentOverrides = JSON.parse(
          localStorage.getItem(coverOverrideKey(user.id)) || '{}',
        ) as Record<string, string>;
        localStorage.setItem(
          coverOverrideKey(user.id),
          JSON.stringify({ ...currentOverrides, [targetBook!.id]: localCoverUrl }),
        );
        setCoverUrls((current) => ({ ...current, [targetBook!.id]: localCoverUrl }));
      };
      reader.readAsDataURL(coverFile);
    } finally {
      setCoverTarget(null);
    }
  }, [books, coverTarget, user]);

  const currentChapter = chapters[currentChapterIndex];

  const goToChapter = useCallback((index: number) => {
    const targetChapter = chapters[index];
    if (!targetChapter) return;
    suppressScrollSaveRef.current = true;
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (targetChapter && user) {
      try {
        const saved = localStorage.getItem(
          readerChapterPositionKey(user.id, targetChapter.book_id, targetChapter.id),
        );
        const parsed = saved ? JSON.parse(saved) as { scrollTop?: unknown } : null;
        initialPositionRef.current = {
          chapterId: targetChapter.id,
          scrollTop: typeof parsed?.scrollTop === 'number' ? parsed.scrollTop : 0,
        };
      } catch {
        initialPositionRef.current = { chapterId: targetChapter.id, scrollTop: 0 };
      }
    }
    setCurrentChapterIndex(index);
    setSidebarOpen(false);
  }, [chapters, user]);

  const goPrev = useCallback(() => {
    goToChapter(Math.max(0, currentChapterIndex - 1));
  }, [currentChapterIndex, goToChapter]);

  const goNext = useCallback(() => {
    goToChapter(Math.min(chapters.length - 1, currentChapterIndex + 1));
  }, [chapters.length, currentChapterIndex, goToChapter]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goPrev, goNext]);

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    if (currentChapter && user && !suppressScrollSaveRef.current) {
      const updatedAt = Date.now();
      localStorage.setItem(
        readerPositionKey(user.id, currentChapter.book_id),
        JSON.stringify({ chapterId: currentChapter.id, updatedAt }),
      );
      localStorage.setItem(
        readerChapterPositionKey(user.id, currentChapter.book_id, currentChapter.id),
        JSON.stringify({ scrollTop: el.scrollTop }),
      );
      pendingProgressRef.current = {
        user_id: user.id,
        book_id: currentChapter.book_id,
        chapter_id: currentChapter.id,
        scroll_top: el.scrollTop,
        completed: false,
        updated_at: new Date(updatedAt).toISOString(),
      };
      if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
      progressSaveTimerRef.current = setTimeout(() => {
        const pendingProgress = pendingProgressRef.current;
        if (pendingProgress) {
          void supabase.from('reading_progress').upsert(pendingProgress).then(({ error: progressError }) => {
            if (progressError) setError(`Không thể lưu tiến độ đọc: ${progressError.message}`);
          });
        }
        pendingProgressRef.current = null;
        progressSaveTimerRef.current = null;
      }, 700);
    }

    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) {
      setScrollProgress(Math.min(100, (el.scrollTop / max) * 100));
    } else {
      setScrollProgress(100);
    }

    if (
      user
      && currentChapter
      && currentChapterIndex === chapters.length - 1
      && el.scrollTop + el.clientHeight >= el.scrollHeight - 8
      && !hasCompletedBook(user.id, currentChapter.book_id)
    ) {
      localStorage.setItem(readerCompletedKey(user.id, currentChapter.book_id), 'true');
      pendingProgressRef.current = {
        user_id: user.id,
        book_id: currentChapter.book_id,
        chapter_id: currentChapter.id,
        scroll_top: el.scrollTop,
        completed: true,
        updated_at: new Date().toISOString(),
      };
      if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
      progressSaveTimerRef.current = setTimeout(() => {
        const pendingProgress = pendingProgressRef.current;
        if (pendingProgress) {
          void supabase.from('reading_progress').upsert(pendingProgress).then(({ error: progressError }) => {
            if (progressError) setError(`Không thể lưu tiến độ đọc: ${progressError.message}`);
          });
        }
        pendingProgressRef.current = null;
        progressSaveTimerRef.current = null;
      }, 100);
      setCloudProgress((current) => ({
        ...current,
        [currentChapter.book_id]: {
          chapterId: currentChapter.id,
          scrollTop: el.scrollTop,
          updatedAt: Date.now(),
          completed: true,
        },
      }));
      setContinueReadingRevision((revision) => revision + 1);
    }
  }, [chapters.length, currentChapter, currentChapterIndex, user]);

  useEffect(() => () => {
    if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
    const pendingProgress = pendingProgressRef.current;
    if (pendingProgress) {
      void supabase.from('reading_progress').upsert(pendingProgress).then(({ error: progressError }) => {
        if (progressError) setError(`Không thể lưu tiến độ đọc: ${progressError.message}`);
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!currentChapter || !contentRef.current) return;

    suppressScrollSaveRef.current = true;
    let frame = 0;
    let attempts = 0;
    const savedPosition = initialPositionRef.current;
    const targetScrollTop = savedPosition?.chapterId === currentChapter.id
      ? savedPosition.scrollTop
      : 0;
    const restore = () => {
      if (!contentRef.current) return;
      contentRef.current.scrollTop = targetScrollTop;
      attempts += 1;
      if (attempts < 8) {
        frame = requestAnimationFrame(restore);
        return;
      }
      initialPositionRef.current = null;
      suppressScrollSaveRef.current = false;
      handleScroll();
    };

    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [currentChapter, handleScroll]);

  const isDark = theme === 'dark';
  const bg = isDark ? 'bg-stone-950' : 'bg-stone-50';
  const textPrimary = isDark ? 'text-stone-100' : 'text-stone-800';
  const textSecondary = isDark ? 'text-stone-400' : 'text-stone-500';
  const sidebarBg = isDark ? 'bg-stone-900' : 'bg-white';
  const border = isDark ? 'border-stone-800' : 'border-stone-200';
  const hover = isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100';
  const activeChapter = isDark ? 'bg-stone-800 text-stone-100' : 'bg-stone-100 text-stone-900';
  const headerBg = isDark ? 'bg-stone-950/95' : 'bg-stone-50/95';

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <BookOpen className="h-10 w-10 animate-pulse text-stone-400" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <BookOpen className={`w-10 h-10 ${textSecondary} animate-pulse`} />
          <p className={textSecondary}>Đang tải sách...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <p className={`text-lg ${textPrimary}`}>{error}</p>
      </div>
    );
  }

  if (!readerOpen && books.length > 0) {
    const libraryTitle = selectedShelf ? selectedShelf.name : 'Kho sách';
    return (
      <div className={`min-h-screen ${bg} ${textPrimary}`}>
        <header className={`sticky top-0 z-20 flex h-16 items-center justify-between border-b ${border} ${isDark ? 'bg-stone-900/95' : 'bg-white/95'} px-4 backdrop-blur sm:px-6`}>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className={`h-5 w-5 ${textSecondary}`} />
            Đọc sách
          </div>
          <div className="flex items-center gap-3">
            <span className={`hidden text-sm ${textSecondary} sm:inline`}>{user.email}</span>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`rounded-lg p-2 ${textSecondary} ${hover}`}
              aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
            >
              {isDark ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={() => void supabase.auth.signOut()}
              className={`rounded-lg p-2 ${textSecondary} ${hover}`}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="w-full px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
          {uploadNotice && (
            <div className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p>{uploadNotice}</p>
              <button
                type="button"
                onClick={() => setUploadNotice(null)}
                className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100"
                aria-label="Đóng thông báo"
                title="Đóng thông báo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className={`relative mb-8 flex flex-col gap-4 border-b ${border} pb-4 sm:flex-row sm:items-end sm:justify-between`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {selectedShelf && (
                  <button
                    onClick={() => setSelectedShelfKey(null)}
                    className={`rounded-lg p-2 ${textSecondary} ${hover}`}
                    aria-label="Quay lại kho sách"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${textSecondary}`}>
                    {selectedShelf ? 'Thư mục' : 'Thư viện'}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{libraryTitle}</h1>
                    {selectedShelf && (
                      <button
                        onClick={() => renameShelf(selectedShelfKey!, selectedShelf.name)}
                        className={`rounded-lg p-2 ${textSecondary} ${hover}`}
                        aria-label="Đổi tên thư mục"
                        title="Đổi tên thư mục"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative w-full flex-1 sm:w-[min(24rem,calc(100vw-2rem))]">
                <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${textSecondary}`} />
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchSuggestionsOpen(true);
                  }}
                  onFocus={() => setSearchSuggestionsOpen(true)}
                  onBlur={(event) => {
                    const searchBox = event.currentTarget.parentElement;
                    const nextTarget = event.relatedTarget;
                    if (!searchBox || !(nextTarget instanceof Node) || !searchBox.contains(nextTarget)) {
                      setSearchSuggestionsOpen(false);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setSubmittedSearchQuery(normalizedSearchQuery);
                      setSearchSuggestionsOpen(false);
                    }
                  }}
                  placeholder="Tìm sách..."
                  aria-label="Tìm sách"
                  className={`w-full rounded-lg border ${border} ${sidebarBg} ${textPrimary} ${isDark ? 'placeholder:text-stone-100' : 'placeholder:text-stone-500'} py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-stone-500`}
                />
                {normalizedSearchQuery && searchSuggestionsOpen && (
                  <div className={`absolute right-0 top-[calc(100%+0.5rem)] z-30 max-h-[28rem] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border ${border} ${sidebarBg} shadow-xl`}>
                    {searchResults.length > 0 ? searchResults.map((libraryBook) => (
                      <button
                        key={libraryBook.id}
                        onClick={() => {
                          setSearchQuery('');
                          setSearchSuggestionsOpen(false);
                          void openBook(libraryBook);
                        }}
                        className={`flex w-full items-center gap-3 border-b ${border} px-3 py-3 text-left last:border-b-0 ${hover}`}
                      >
                        {coverUrls[libraryBook.id] ? (
                          <img
                            src={coverUrls[libraryBook.id]}
                            alt=""
                            className="h-16 w-12 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-16 w-12 shrink-0 items-center justify-center rounded"
                            style={{ backgroundColor: libraryBook.cover_color }}
                          >
                            <BookOpen className="h-5 w-5 text-white/90" />
                          </div>
                        )}
                        <span className="min-w-0 leading-tight">
                          <span className={`block truncate text-sm font-semibold ${textPrimary}`}>{libraryBook.title}</span>
                          <span className={`mt-1 block truncate text-xs ${textSecondary}`}>{libraryBook.author}</span>
                        </span>
                      </button>
                    )) : (
                      <p className={`px-3 py-3 text-sm ${textSecondary}`}>Không tìm thấy sách phù hợp.</p>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 whitespace-nowrap rounded-lg bg-stone-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-stone-700 sm:px-4"
              >
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Thêm sách
                </span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,application/epub+zip,.epub"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverUpload}
              className="hidden"
            />
          </div>
          {contextMenu && (
            <div
              className={`fixed z-50 w-52 overflow-hidden rounded-lg border ${border} ${sidebarBg} py-1 shadow-xl`}
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              {contextMenu.type === 'book' && contextMenu.book ? (
                <>
                  <button
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm ${textPrimary} ${hover}`}
                    onClick={() => {
                      setShareDialog({ books: [contextMenu.book!], email: '', busy: false, result: null });
                      setContextMenu(null);
                    }}
                  >
                    <Send className="h-4 w-4" />
                    Gửi cho tài khoản khác
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm ${textPrimary} ${hover}`}
                    onClick={() => {
                      const selectedBook = contextMenu.book!;
                      setContextMenu(null);
                      void handleRename(selectedBook);
                    }}
                  >
                    Đổi tên sách
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm ${textPrimary} ${hover}`}
                    onClick={() => {
                      setCoverTarget({ type: 'book', id: contextMenu.book!.id });
                      setContextMenu(null);
                      requestAnimationFrame(() => coverInputRef.current?.click());
                    }}
                  >
                    Đổi ảnh bìa
                  </button>
                  {contextMenu.fromContinueReading && (
                    <button
                      className={`w-full px-4 py-2.5 text-left text-sm ${textPrimary} ${hover}`}
                      onClick={() => removeFromContinueReading(contextMenu.book!)}
                    >
                      Xóa khỏi tiếp tục đọc
                    </button>
                  )}
                  <button
                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const selectedBook = contextMenu.book!;
                      setContextMenu(null);
                      setDeleteDialog({ type: 'book', book: selectedBook });
                    }}
                  >
                    Xóa sách
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm ${textPrimary} ${hover}`}
                    onClick={() => {
                      setShareDialog({ books: contextMenu.shelfBooks || [], email: '', busy: false, result: null });
                      setContextMenu(null);
                    }}
                  >
                    <Send className="h-4 w-4" />
                    Gửi thư mục
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm ${textPrimary} ${hover}`}
                    onClick={() => {
                      renameShelf(contextMenu.shelfKey!, contextMenu.shelfName!);
                      setContextMenu(null);
                    }}
                  >
                    Đổi tên thư mục
                  </button>
                  <button
                    className={`w-full px-4 py-2.5 text-left text-sm ${textPrimary} ${hover}`}
                    onClick={() => {
                      setCoverTarget({ type: 'shelf', id: contextMenu.shelfKey! });
                      setContextMenu(null);
                      requestAnimationFrame(() => coverInputRef.current?.click());
                    }}
                  >
                    Đổi ảnh thư mục
                  </button>
                  <button
                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const shelfName = contextMenu.shelfName!;
                      const shelfBooks = contextMenu.shelfBooks!;
                      setContextMenu(null);
                      setDeleteDialog({ type: 'shelf', shelfName, shelfBooks });
                    }}
                  >
                    Xóa thư mục và sách
                  </button>
                </>
              )}
            </div>
          )}
          {renameDialog && (
            <RenameDialog
              label={renameDialog.type === 'book' ? 'Đổi tên sách' : 'Đổi tên thư mục'}
              value={renameDialog.value}
              onChange={(value) => setRenameDialog((current) => current ? { ...current, value } : current)}
              onCancel={() => setRenameDialog(null)}
              onSubmit={() => void submitRename()}
            />
          )}
          {shareDialog && (
            <ShareDialog
              email={shareDialog.email}
              onEmailChange={(email) => setShareDialog((current) => current ? { ...current, email } : current)}
              itemLabel={shareDialog.books.length === 1 ? 'sách' : 'thư mục'}
              busy={shareDialog.busy}
              result={shareDialog.result}
              onCancel={() => setShareDialog(null)}
              onSubmit={() => void handleShare()}
            />
          )}
          {deleteDialog && (
            <DeleteDialog
              title={deleteDialog.type === 'shelf'
                ? 'Xóa thư mục?'
                : deleteDialog.type === 'books' ? `Xóa ${deleteDialog.books.length} sách?` : 'Xóa sách?'}
              description={deleteDialog.type === 'shelf'
                ? `Bạn có chắc muốn xóa thư mục "${deleteDialog.shelfName}" và ${deleteDialog.shelfBooks.length} sách bên trong không?`
                : deleteDialog.type === 'books'
                  ? `Bạn có chắc muốn xóa ${deleteDialog.books.length} sách đã chọn không?`
                  : `Bạn có chắc muốn xóa "${deleteDialog.book.title}" không?`}
              onCancel={() => setDeleteDialog(null)}
              onConfirm={() => {
                const target = deleteDialog;
                setDeleteDialog(null);
                if (target.type === 'book') void handleDelete(target.book);
                else if (target.type === 'books') void handleDeleteBooks(target.books);
                else void handleDeleteShelf(target.shelfName, target.shelfBooks);
              }}
            />
          )}
          {submittedSearchQuery ? (
            <section>
              <div className={`mb-6 flex flex-col gap-2 border-b ${border} pb-3 sm:flex-row sm:items-end sm:justify-between`}>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${textSecondary}`}>Tìm kiếm</p>
                  <h2 className="mt-1 text-xl font-bold sm:text-2xl">Kết quả cho “{submittedSearchQuery}”</h2>
                </div>
                <button
                  onClick={() => {
                    setSubmittedSearchQuery('');
                    setSearchQuery('');
                  }}
                  className={`rounded-lg px-3 py-2 text-sm ${textSecondary} ${hover}`}
                >
                  Về kho sách
                </button>
              </div>
              {submittedSearchResults.length > 0 ? (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                  {submittedSearchResults.map((libraryBook) => (
                    <LibraryBookCard
                      key={libraryBook.id}
                      book={libraryBook}
                      coverUrl={coverUrls[libraryBook.id]}
                      isDark={isDark}
                      onOpen={() => void openBook(libraryBook)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenu({ type: 'book', book: libraryBook, x: event.clientX, y: event.clientY });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className={`py-12 text-center ${textSecondary}`}>Không tìm thấy sách phù hợp.</p>
              )}
            </section>
          ) : !selectedShelf && continueReadingBooks.length > 0 && (
            <section className="mb-10">
              <div className={`mb-4 border-b ${border} pb-3`}>
                <h2 className="text-xl font-bold">Tiếp tục đọc</h2>
              </div>
              <div className={`scrollbar-hover ${isDark ? 'scrollbar-hover-dark' : ''} flex items-start gap-6 overflow-x-auto pb-3`}>
                {continueReadingBooks.map((libraryBook) => (
                  <LibraryBookCard
                    key={`continue-${libraryBook.id}`}
                    book={libraryBook}
                    coverUrl={coverUrls[libraryBook.id]}
                    isDark={isDark}
                    onOpen={() => void openBook(libraryBook)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ type: 'book', book: libraryBook, fromContinueReading: true, x: event.clientX, y: event.clientY });
                    }}
                  />
                ))}
              </div>
            </section>
          )}
          {!submittedSearchQuery && <div>
            {selectedShelf ? (
              <section>
                <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 text-sm ${textSecondary}`}>
                  <div className="flex items-center gap-2">
                    <Folder className="h-5 w-5" />
                    <span className="sm:hidden">{selectedShelf.books.length} sách</span>
                    <span className="hidden sm:inline">{selectedShelf.books.length} sách trong thư mục này</span>
                  </div>
                  <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto">
                    {!selectionMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectionMode(true);
                          setSelectedBookIds(new Set());
                        }}
                        className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${textSecondary} ${hover}`}
                      >
                        Chọn
                      </button>
                    )}
                    {selectionMode && (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedBookIds.size === selectedShelf.books.length) {
                            setSelectedBookIds(new Set());
                            setSelectionMode(false);
                          } else {
                            setSelectedBookIds(new Set(selectedShelf.books.map((item) => item.id)));
                          }
                        }}
                      className={`rounded-lg px-3 py-2 text-xs font-medium ${textSecondary} ${hover}`}
                      >
                        {selectedBookIds.size === selectedShelf.books.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      </button>
                    )}
                    {selectedBookIds.size > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShareDialog({
                            books: selectedShelf.books.filter((item) => selectedBookIds.has(item.id)),
                            email: '',
                            busy: false,
                            result: null,
                          })}
                          className="flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-700"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Gửi {selectedBookIds.size} sách
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteDialog({
                            type: 'books',
                            books: selectedShelf.books.filter((item) => selectedBookIds.has(item.id)),
                          })}
                          className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Xóa {selectedBookIds.size} sách
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                  {selectedShelf.books.map((libraryBook) => (
                    <div key={libraryBook.id} className="relative">
                      {selectionMode && (
                        <label className="absolute right-2 top-2 z-10 flex cursor-pointer items-center rounded-md bg-white/90 p-1.5 shadow-sm">
                          <input
                            type="checkbox"
                            checked={selectedBookIds.has(libraryBook.id)}
                            onChange={() => setSelectedBookIds((current) => {
                              const next = new Set(current);
                              if (next.has(libraryBook.id)) next.delete(libraryBook.id);
                              else next.add(libraryBook.id);
                              return next;
                            })}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Chọn ${libraryBook.title}`}
                            className="h-4 w-4 accent-stone-800"
                          />
                        </label>
                      )}
                      <LibraryBookCard
                        book={libraryBook}
                        coverUrl={coverUrls[libraryBook.id]}
                        isDark={isDark}
                        fullWidth
                        onOpen={() => void openBook(libraryBook)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenu({ type: 'book', book: libraryBook, x: event.clientX, y: event.clientY });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section>
                <div className={`mb-6 border-b ${border} pb-3`}>
                  <h2 className="text-2xl font-bold">Kho sách</h2>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                  {sortedShelves.map(([shelfKey, shelf]) => {
                    const coverBook = shelf.books.find((shelfBook) => coverUrls[shelfBook.id]) || shelf.books[0];
                    const shelfCoverUrl = shelfCoverOverrides[shelfKey] || coverUrls[coverBook.id];
                    return (
                    <button
                      key={shelfKey}
                      onClick={() => {
                        setSelectedShelfKey(shelfKey);
                        setSelectedBookIds(new Set());
                        setSelectionMode(false);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenu({
                          type: 'shelf',
                          shelfKey,
                          shelfName: shelf.name,
                          shelfBooks: shelf.books,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      className="group text-left"
                    >
                      {shelfCoverUrl ? (
                        <img
                          src={shelfCoverUrl}
                          alt={`Ảnh bìa đại diện cho ${shelf.name}`}
                          className="aspect-[3/4] w-full rounded-xl object-cover shadow-sm transition-transform group-hover:-translate-y-1"
                        />
                      ) : (
                        <div
                          className="flex aspect-[3/4] items-end rounded-xl p-4 shadow-sm transition-transform group-hover:-translate-y-1"
                          style={{ backgroundColor: coverBook.cover_color }}
                        >
                          <Folder className="h-8 w-8 text-white/90" />
                        </div>
                      )}
                      <h3 className="mt-3 truncate text-base font-semibold">{shelf.name}</h3>
                      <p className={`mt-1 text-sm ${textSecondary}`}>{shelf.books.length} sách</p>
                    </button>
                    );
                  })}
                </div>
              </section>
            )}
            </div>}
        </main>
      </div>
    );
  }

  if (!book) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center px-6`}>
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <Library className={`h-10 w-10 ${textSecondary}`} />
          <div>
            <h1 className={`text-xl font-semibold ${textPrimary}`}>Thư viện đang trống</h1>
            <p className={`mt-2 text-sm ${textSecondary}`}>Thêm PDF hoặc EPUB để bắt đầu đọc.</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${activeChapter} transition-colors`}
          >
            <Upload className="h-4 w-4" />
            Thêm PDF / EPUB
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,application/epub+zip,.epub"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>
    );
  }

  if (!book.file_path && chapters.length === 0) {
    return (
      <div className={`min-h-screen ${bg} flex items-center justify-center`}>
        <p className={`text-lg ${textPrimary}`}>Chưa có chương để đọc.</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} flex flex-col transition-colors duration-300`}>
      {renameDialog && (
        <RenameDialog
          label={renameDialog.type === 'book' ? 'Đổi tên sách' : 'Đổi tên thư mục'}
          value={renameDialog.value}
          onChange={(value) => setRenameDialog((current) => current ? { ...current, value } : current)}
          onCancel={() => setRenameDialog(null)}
          onSubmit={() => void submitRename()}
        />
      )}
      {deleteDialog && (
        <DeleteDialog
          title={deleteDialog.type === 'shelf'
            ? 'Xóa thư mục?'
            : deleteDialog.type === 'books' ? `Xóa ${deleteDialog.books.length} sách?` : 'Xóa sách?'}
          description={deleteDialog.type === 'shelf'
            ? `Bạn có chắc muốn xóa thư mục "${deleteDialog.shelfName}" và ${deleteDialog.shelfBooks.length} sách bên trong không?`
            : deleteDialog.type === 'books'
              ? `Bạn có chắc muốn xóa ${deleteDialog.books.length} sách đã chọn không?`
              : `Bạn có chắc muốn xóa "${deleteDialog.book.title}" không?`}
          onCancel={() => setDeleteDialog(null)}
          onConfirm={() => {
            const target = deleteDialog;
            setDeleteDialog(null);
            if (target.type === 'book') void handleDelete(target.book);
            else if (target.type === 'books') void handleDeleteBooks(target.books);
            else void handleDeleteShelf(target.shelfName, target.shelfBooks);
          }}
        />
      )}
      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-30 ${headerBg} backdrop-blur-md border-b ${border} transition-colors duration-300`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 h-12">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Mở danh sách chương"
            >
              <List className={`w-5 h-5 ${textPrimary}`} />
            </button>
            <button
              onClick={() => {
                setSelectedShelfKey(null);
                setReaderOpen(false);
              }}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Quay lại thư viện"
              title="Thư viện"
            >
              <Library className={`w-5 h-5 ${textPrimary}`} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className={`w-5 h-5 ${textSecondary} shrink-0`} />
              <span className={`text-sm font-medium truncate ${textPrimary}`}>
                Đọc
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Cài đặt đọc sách"
            >
              <Type className={`w-5 h-5 ${textPrimary}`} />
            </button>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Đổi chế độ sáng tối"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className={`w-5 h-5 ${textPrimary}`} />
              )}
            </button>
            <button
              onClick={() => void supabase.auth.signOut()}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Đăng xuất"
              title={user.email || 'Đăng xuất'}
            >
              <LogOut className={`w-5 h-5 ${textPrimary}`} />
            </button>
          </div>
        </div>

        {/* Settings dropdown */}
        {settingsOpen && (
          <div
            className={`absolute right-2 top-12 ${sidebarBg} border ${border} rounded-xl shadow-lg p-4 w-64 fade-in`}
          >
            <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary} mb-3`}>
              Cỡ chữ
            </p>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setFontSize('small')}
                className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                  fontSize === 'small'
                    ? activeChapter
                    : `${hover} ${textPrimary}`
                }`}
              >
                <Minus className="w-4 h-4 mx-auto" />
              </button>
              <button
                onClick={() => setFontSize('medium')}
                className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                  fontSize === 'medium'
                    ? activeChapter
                    : `${hover} ${textPrimary}`
                }`}
              >
                <Type className="w-4 h-4 mx-auto" />
              </button>
              <button
                onClick={() => setFontSize('large')}
                className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                  fontSize === 'large'
                    ? activeChapter
                    : `${hover} ${textPrimary}`
                }`}
              >
                <Plus className="w-4 h-4 mx-auto" />
              </button>
            </div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary} mb-2`}>
              Giao diện
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors ${
                  !isDark ? activeChapter : `${hover} ${textPrimary}`
                }`}
              >
                <Sun className="w-4 h-4" /> Sáng
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors ${
                  isDark ? activeChapter : `${hover} ${textPrimary}`
                }`}
              >
                <Moon className="w-4 h-4" /> Tối
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Chapter sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 w-80 max-w-[85vw] ${sidebarBg} border-r ${border} transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className={`flex items-center justify-between px-5 h-14 border-b ${border}`}>
          <h2 className={`text-sm font-semibold ${textPrimary}`}>Thư viện</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className={`p-1.5 rounded-lg ${hover} transition-colors`}
            aria-label="Close sidebar"
          >
            <X className={`w-5 h-5 ${textPrimary}`} />
          </button>
        </div>
        <div className={`overflow-y-auto scrollbar-thin ${isDark ? 'scrollbar-thin-dark' : ''} h-[calc(100vh-3.5rem)]`}>
          <div className="p-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full mb-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${activeChapter} transition-colors`}
            >
              <Upload className="w-4 h-4" />
              Thêm tệp PDF / EPUB
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,application/epub+zip,.epub"
              multiple
              onChange={handleUpload}
              className="hidden"
            />

            <div className={`mb-4 pb-4 border-b ${border}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary} mb-2`}>
                Sách
              </p>
              <div className="space-y-2">
                {sortedShelves.map(([shelfKey, shelf]) => {
                  const isOpen = openShelves[shelfKey] === true;
                  return (
                    <div key={shelfKey}>
                      <div className={`flex items-center gap-1 rounded-lg ${hover}`}>
                        <button
                          onClick={() => setOpenShelves((current) => ({ ...current, [shelfKey]: !isOpen }))}
                          className={`min-w-0 flex-1 flex items-center gap-2 px-2 py-2 ${textPrimary} text-sm font-medium`}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <Folder className="h-4 w-4" />
                          <span className="truncate">{shelf.name}</span>
                          <span className={`ml-auto text-xs ${textSecondary}`}>{shelf.books.length}</span>
                        </button>
                        <button
                          onClick={() => renameShelf(shelfKey, shelf.name)}
                          className={`rounded-lg p-2 ${textSecondary} hover:text-stone-900 dark:hover:text-stone-100`}
                          aria-label={`Đổi tên ${shelf.name}`}
                          title="Đổi tên danh mục"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                      {isOpen && (
                        <ul className="mt-1 space-y-1 pl-3">
                          {shelf.books.map((libraryBook) => (
                            <li key={libraryBook.id} className="flex items-center gap-1">
                              <button
                                onClick={() => void selectBook(libraryBook)}
                                className={`min-w-0 flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                                  libraryBook.id === book.id ? activeChapter : `${hover} ${textPrimary}`
                                }`}
                              >
                                {libraryBook.file_type ? <FileText className="w-4 h-4 shrink-0" /> : <Library className="w-4 h-4 shrink-0" />}
                                <span className="truncate">{libraryBook.title}</span>
                              </button>
                              <button
                                onClick={() => setDeleteDialog({ type: 'book', book: libraryBook })}
                                className={`shrink-0 rounded-lg p-2 ${hover} transition-colors`}
                                aria-label={`Xóa ${libraryBook.title}`}
                              >
                                <Trash2 className={`h-4 w-4 ${textSecondary}`} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`mb-4 pb-4 border-b ${border}`}>
              <h3 className={`text-base font-bold ${textPrimary}`}>{book.title}</h3>
              <p className={`text-sm ${textSecondary}`}>{book.author}</p>
              {book.description && (
                <p className={`text-xs mt-2 ${textSecondary} leading-relaxed`}>
                  {book.description}
                </p>
              )}
            </div>
            {chapters.length > 0 && (
              <ul className="space-y-1">
                {chapters.map((ch, i) => (
                  <li key={ch.id}>
                    <button
                      onClick={() => goToChapter(i)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        i === currentChapterIndex ? activeChapter : `${hover} ${textPrimary}`
                      }`}
                    >
                      <span className={textSecondary}>
                        {String(ch.chapter_number).padStart(2, '0')}.
                      </span>{' '}
                      {ch.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* Main reading area */}
      <main
        ref={contentRef}
        onScroll={handleScroll}
        onClick={(event) => {
          if (book.file_type === 'pdf') return;
          const target = event.target;
          if (target instanceof Element && target.closest('button, a, input, select, textarea')) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left + bounds.width * 0.35) goPrev();
          if (event.clientX > bounds.left + bounds.width * 0.65) goNext();
        }}
        className={`flex-1 overflow-y-auto scrollbar-thin ${isDark ? 'scrollbar-thin-dark' : ''} pt-12 transition-colors duration-300 ${book.file_type === 'pdf' ? 'pb-0' : 'pb-16'}`}
      >
        <div className={book.file_type === 'pdf' ? 'w-full max-w-none' : 'w-full max-w-none px-5 py-8 sm:px-10 sm:py-10 lg:px-16'}>
          {book.file_type === 'pdf' && currentChapter?.pdf_url ? (
            <PdfReader
              url={currentChapter.pdf_url}
              fileName={book.title}
              positionKey={readerPositionKey(user.id, book.id)}
              pageNumber={currentChapter.pdf_page_number || currentChapterIndex + 1}
              pageCount={chapters.length}
              onPageChange={(page) => goToChapter(page - 1)}
              isDark={isDark}
            />
          ) : currentChapter ? (
            <article key={currentChapter.id} className="fade-in">
              <header className={`mb-8 border-b ${border} pb-5 text-center`}>
                <h1 className={`text-2xl sm:text-3xl font-bold ${textPrimary} leading-tight`}>
                  {currentChapter.title}
                </h1>
                <p className={`mt-3 text-xs ${textSecondary}`}>
                  Cập nhật: {new Date(book.created_at).toLocaleDateString('vi-VN')}
                </p>
              </header>

              <div
                className={`reading-content reading-content-full ${textPrimary}`}
                style={{ fontSize: fontSizes[fontSize] }}
              >
                {currentChapter.content_html ? (
                  <div dangerouslySetInnerHTML={{ __html: currentChapter.content_html }} />
                ) : (
                  currentChapter.content.split('\n\n').map((para, i) => <p key={i}>{para}</p>)
                )}
              </div>

              {/* Chapter navigation */}
              <nav className="mt-16 flex items-center justify-between gap-4">
                <button
                  onClick={goPrev}
                  disabled={currentChapterIndex === 0}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    currentChapterIndex === 0
                      ? 'opacity-30 cursor-not-allowed'
                      : `${hover} ${textPrimary}`
                  }`}
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span className="hidden sm:inline">Trang trước</span>
                </button>

                <span className={`text-xs ${textSecondary}`}>
                  {currentChapterIndex + 1} / {chapters.length}
                </span>

                <button
                  onClick={goNext}
                  disabled={currentChapterIndex === chapters.length - 1}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    currentChapterIndex === chapters.length - 1
                      ? 'opacity-30 cursor-not-allowed'
                      : `${hover} ${textPrimary}`
                  }`}
                >
                  <span className="hidden sm:inline">Trang sau</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </nav>
            </article>
          ) : null}
        </div>
      </main>

      {/* Reading progress bar */}
      {book.file_type !== 'pdf' && (
        <div className="fixed bottom-0 left-0 right-0 z-20 h-0.5">
          <div
            className="h-full bg-stone-400 transition-all duration-150 dark:bg-stone-500"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}