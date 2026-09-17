import { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import JSZip from 'jszip';

type Theme = 'light' | 'dark';
type FontSize = 'small' | 'medium' | 'large';
type ReadingPosition = {
  chapterId: string;
  scrollTop: number;
};

function readerPositionKey(userId: string, bookId: string) {
  return `reader-position:${userId}:${bookId}`;
}

const fontSizes: Record<FontSize, string> = {
  small: '1rem',
  medium: '1.125rem',
  large: '1.375rem',
};

function normalizeBookMetadata(book: Book): Book {
  if (book.author !== 'Unknown author' || !book.title.includes(' - ')) return book;
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
  if (book.author.trim() && book.author !== 'Unknown author') return book.author.trim();
  const seriesName = book.title
    .replace(/\s*[-_:|]\s*(?:vol(?:ume)?|tập|tap|quyển|quyen)?\s*\d+.*$/i, '')
    .replace(/\s+(?:vol(?:ume)?|tập|tap|quyển|quyen)\s*\d+.*$/i, '')
    .trim();
  return seriesName || 'Kho chưa phân loại';
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
    else if (isSignUp && !result.data.session) setMessage('Check your email to confirm your account.');
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

function LibraryBookCard({ book, coverUrl, onOpen }: { book: Book; coverUrl?: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group w-44 shrink-0 text-left sm:w-48">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={`Cover ${book.title}`}
          className="mb-3 aspect-[3/4] w-full rounded-xl object-cover shadow-sm transition-transform group-hover:-translate-y-1"
        />
      ) : (
        <div
          className="mb-3 flex aspect-[3/4] items-end rounded-xl p-3 shadow-sm transition-transform group-hover:-translate-y-1"
          style={{ backgroundColor: book.cover_color }}
        >
          <BookOpen className="h-8 w-8 text-white/90" />
        </div>
      )}
      <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-stone-800 group-hover:text-stone-600">
        {book.title}
      </h3>
      <p className="mt-1 truncate text-xs text-stone-500">{book.author}</p>
    </button>
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
  if (!response.ok) throw new Error('Could not download the EPUB file.');

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('This EPUB has no container file.');

  const container = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootFile) throw new Error('This EPUB has no package file.');

  const packageXml = await zip.file(rootFile)?.async('string');
  if (!packageXml) throw new Error('This EPUB package file is missing.');

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

  if (chapters.length === 0) throw new Error('No readable text chapters were found in this EPUB.');
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [selectedShelfKey, setSelectedShelfKey] = useState<string | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [openShelves, setOpenShelves] = useState<Record<string, boolean>>({});
  const [shelfRenames, setShelfRenames] = useState<Record<string, string>>({});
  const [scrollProgress, setScrollProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialPositionRef = useRef<ReadingPosition | null>(null);

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
    } catch {
      setShelfRenames({});
    }
  }, []);

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
    let active = true;
    const objectUrls: string[] = [];
    void Promise.all(
      books
        .filter((libraryBook) => libraryBook.file_type === 'epub' && libraryBook.file_path)
        .map(async (libraryBook) => {
          try {
            const url = await extractEpubCoverUrl(
              supabase.storage.from('books').getPublicUrl(libraryBook.file_path!).data.publicUrl,
            );
            if (url) objectUrls.push(url);
            return [libraryBook.id, url] as const;
          } catch {
            return [libraryBook.id, null] as const;
          }
        }),
    ).then((entries) => {
      if (active) setCoverUrls(Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))));
    });
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [books]);

  useEffect(() => {
    if (!user) {
      initialPositionRef.current = null;
      setIsAdmin(false);
      setReaderOpen(false);
      setSelectedShelfKey(null);
      setBooks([]);
      setBook(null);
      setChapters([]);
      setLoading(false);
      return;
    }
    const currentUser = user;

    void supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(data?.role === 'admin'));

    async function loadData() {
      try {
        const { data: bookData, error: bookError } = await supabase
          .from('books')
          .select('*')
          .order('created_at', { ascending: false });

        if (bookError) throw bookError;
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
          const savedPosition = localStorage.getItem(
            readerPositionKey(currentUser.id, normalizedBooks[0].id),
          );
          if (savedPosition) {
            const parsed = JSON.parse(savedPosition) as ReadingPosition;
            if (typeof parsed.chapterId === 'string' && typeof parsed.scrollTop === 'number') {
              initialPositionRef.current = parsed;
            }
          }
        } catch {
          initialPositionRef.current = null;
        }

        const loadedChapters =
          normalizedBooks[0].file_type === 'epub' && normalizedBooks[0].file_path
            ? await extractEpubChapters(
                supabase.storage.from('books').getPublicUrl(normalizedBooks[0].file_path).data.publicUrl,
                normalizedBooks[0].id,
              )
            : await loadStoredChapters(normalizedBooks[0].id);
        setChapters(loadedChapters);
        const savedChapterIndex = loadedChapters.findIndex(
          (chapter) => chapter.id === initialPositionRef.current?.chapterId,
        );
        if (savedChapterIndex >= 0) setCurrentChapterIndex(savedChapterIndex);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load book.');
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const selectBook = useCallback(async (selectedBook: Book) => {
    setError(null);
    setBook(selectedBook);
    setChapters([]);
    setScrollProgress(0);
    setSidebarOpen(false);

    let savedPosition: ReadingPosition | null = null;
    try {
      const saved = user
        ? localStorage.getItem(readerPositionKey(user.id, selectedBook.id))
        : null;
      if (saved) {
        const parsed = JSON.parse(saved) as ReadingPosition;
        if (typeof parsed.chapterId === 'string' && typeof parsed.scrollTop === 'number') {
          savedPosition = parsed;
        }
      }
    } catch {
      savedPosition = null;
    }
    initialPositionRef.current = savedPosition;

    try {
      setLoading(true);
      const loadedChapters =
        selectedBook.file_type === 'epub' && selectedBook.file_path
          ? await extractEpubChapters(
              supabase.storage.from('books').getPublicUrl(selectedBook.file_path).data.publicUrl,
              selectedBook.id,
            )
          : selectedBook.file_path
            ? []
            : await loadStoredChapters(selectedBook.id);
      setChapters(loadedChapters);
      const savedChapterIndex = loadedChapters.findIndex(
        (chapter) => chapter.id === savedPosition?.chapterId,
      );
      setCurrentChapterIndex(savedChapterIndex >= 0 ? savedChapterIndex : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the book.');
      setCurrentChapterIndex(0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const invalidFile = files.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return (extension !== 'pdf' && extension !== 'epub') || file.size > 100 * 1024 * 1024;
    });
    if (invalidFile) {
      setError(`${invalidFile.name}: only PDF/EPUB files under 100 MB are supported.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const uploadedBooks = await Promise.all(files.map(async (file) => {
        const extension = file.name.split('.').pop()?.toLowerCase() as 'pdf' | 'epub';
        if (!user) throw new Error('Please sign in before uploading books.');
        const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('books').upload(filePath, file, {
          contentType: file.type || (extension === 'pdf' ? 'application/pdf' : 'application/epub+zip'),
          upsert: false,
        });
        if (uploadError) throw uploadError;

        const fileLabel = file.name.replace(/\.(pdf|epub)$/i, '').trim() || 'Untitled book';
        const [titlePart, ...authorParts] = fileLabel.split(/\s+-\s+/);
        const title = titlePart.trim() || fileLabel;
        const author = authorParts.join(' - ').trim() || 'Unknown author';
        const { data: newBook, error: insertError } = await supabase
          .from('books')
            .insert({
              title,
              author,
              file_path: filePath,
              file_type: extension,
              owner_id: user.id,
              is_public: isAdmin,
            })
          .select('*')
          .single();
        if (insertError) throw insertError;
        return newBook;
      }));

      const normalizedNewBooks = uploadedBooks.map(normalizeBookMetadata);
      setBooks((currentBooks) => sortBooksByTitle([...normalizedNewBooks, ...currentBooks]));
      await selectBook(normalizedNewBooks[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the book.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectBook, user]);

  const getBookUrl = useCallback((selectedBook: Book) => {
    if (!selectedBook.file_path) return null;
    return supabase.storage.from('books').getPublicUrl(selectedBook.file_path).data.publicUrl;
  }, []);

  const renameShelf = useCallback((shelfKey: string, currentName: string) => {
    const nextName = window.prompt('Tên danh mục mới:', currentName);
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    setShelfRenames((current) => {
      const updated = { ...current };
      if (trimmedName) updated[shelfKey] = trimmedName;
      else delete updated[shelfKey];
      return updated;
    });
  }, []);

  const shelves = books.reduce<Map<string, { name: string; books: Book[] }>>((groups, libraryBook) => {
    const baseShelfName = getShelfName(libraryBook);
    const shelfKey = baseShelfName.toLocaleLowerCase('vi');
    const shelfName = shelfRenames[shelfKey] || baseShelfName;
    const shelf = groups.get(shelfKey) || { name: shelfName, books: [] };
    shelf.books.push(libraryBook);
    groups.set(shelfKey, shelf);
    return groups;
  }, new Map());
  const sortedShelves = Array.from(shelves.entries()).sort((left, right) =>
    left[1].name.localeCompare(right[1].name, 'vi', { sensitivity: 'base' }),
  );
  const continueBooks = books.filter((libraryBook) =>
    Boolean(localStorage.getItem(readerPositionKey(user?.id || '', libraryBook.id))),
  );
  const featuredBook = books.find((libraryBook) =>
    /bạch\s*dạ\s*hành|bach\s*da\s*hanh/i.test(libraryBook.title),
  );
  const continueReadingBooks = continueBooks.length > 0 ? continueBooks : featuredBook ? [featuredBook] : [];
  const selectedShelf = sortedShelves.find(([shelfKey]) => shelfKey === selectedShelfKey)?.[1];

  const openBook = useCallback(async (selectedBook: Book) => {
    await selectBook(selectedBook);
    setReaderOpen(true);
  }, [selectBook]);

  const handleDelete = useCallback(async (bookToDelete: Book) => {
    if (!window.confirm(`Delete "${bookToDelete.title}"?`)) return;

    setLoading(true);
    setError(null);
    try {
      if (bookToDelete.file_path) {
        const { error: storageError } = await supabase.storage
          .from('books')
          .remove([bookToDelete.file_path]);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase
        .from('books')
        .delete()
        .eq('id', bookToDelete.id);
      if (deleteError) throw deleteError;

      const remainingBooks = books.filter((libraryBook) => libraryBook.id !== bookToDelete.id);
      setBooks(remainingBooks);
      if (book?.id === bookToDelete.id) {
        if (remainingBooks[0]) {
          await selectBook(remainingBooks[0]);
        } else {
          setBook(null);
          setChapters([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the book.');
    } finally {
      setLoading(false);
    }
  }, [book, books, selectBook]);

  const currentChapter = chapters[currentChapterIndex];

  const goToChapter = useCallback((index: number) => {
    setCurrentChapterIndex(index);
    setSidebarOpen(false);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, []);

  const goPrev = useCallback(() => {
    setCurrentChapterIndex((i) => Math.max(0, i - 1));
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, []);

  const goNext = useCallback(() => {
    setCurrentChapterIndex((i) => Math.min(chapters.length - 1, i + 1));
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [chapters.length]);

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

    if (currentChapter && user) {
      localStorage.setItem(
        readerPositionKey(user.id, currentChapter.book_id),
        JSON.stringify({ chapterId: currentChapter.id, scrollTop: el.scrollTop }),
      );
    }

    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) {
      setScrollProgress(Math.min(100, (el.scrollTop / max) * 100));
    } else {
      setScrollProgress(100);
    }
  }, [currentChapter, user]);

  useEffect(() => {
    if (!currentChapter || !contentRef.current) return;

    const frame = requestAnimationFrame(() => {
      const savedPosition = initialPositionRef.current;
      contentRef.current!.scrollTop =
        savedPosition?.chapterId === currentChapter.id ? savedPosition.scrollTop : 0;
      initialPositionRef.current = null;
      handleScroll();
    });

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
          <p className={textSecondary}>Loading book...</p>
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
      <div className="min-h-screen bg-stone-50 text-stone-800">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200 bg-white/95 px-6 backdrop-blur">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-5 w-5 text-stone-600" />
            Đọc sách
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-stone-500 sm:inline">{user.email}</span>
            <button
              onClick={() => void supabase.auth.signOut()}
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
          <div className="mb-8 flex items-end justify-between border-b border-stone-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                {selectedShelf && (
                  <button
                    onClick={() => setSelectedShelfKey(null)}
                    className="rounded-lg p-2 text-stone-600 hover:bg-stone-100"
                    aria-label="Quay lại kho sách"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    {selectedShelf ? 'Thư mục' : 'Thư viện'}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">{libraryTitle}</h1>
                    {selectedShelf && (
                      <button
                        onClick={() => renameShelf(selectedShelfKey!, selectedShelf.name)}
                        className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
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
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700"
            >
              <Upload className="h-4 w-4" />
              Thêm sách
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
          {!selectedShelf && continueReadingBooks.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 border-b border-stone-200 pb-3">
                <h2 className="text-xl font-bold">Tiếp tục đọc</h2>
              </div>
              <div className="flex gap-6 overflow-x-auto pb-3">
                {continueReadingBooks.map((libraryBook) => (
                  <LibraryBookCard
                    key={`continue-${libraryBook.id}`}
                    book={libraryBook}
                    coverUrl={coverUrls[libraryBook.id]}
                    onOpen={() => void openBook(libraryBook)}
                  />
                ))}
              </div>
            </section>
          )}
          <div>
            {selectedShelf ? (
              <section>
                <div className="mb-6 flex items-center gap-2 text-sm text-stone-500">
                  <Folder className="h-5 w-5" />
                  <span>{selectedShelf.books.length} sách trong thư mục này</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-8">
                  {selectedShelf.books.map((libraryBook) => (
                    <LibraryBookCard
                      key={libraryBook.id}
                      book={libraryBook}
                      coverUrl={coverUrls[libraryBook.id]}
                      onOpen={() => void openBook(libraryBook)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <section>
                <div className="mb-6 border-b border-stone-200 pb-3">
                  <h2 className="text-2xl font-bold">Kho sách</h2>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                  {sortedShelves.map(([shelfKey, shelf]) => (
                    <button
                      key={shelfKey}
                      onClick={() => setSelectedShelfKey(shelfKey)}
                      className="group text-left"
                    >
                      {coverUrls[shelf.books[0].id] ? (
                        <img
                          src={coverUrls[shelf.books[0].id]}
                          alt={`Ảnh bìa đại diện cho ${shelf.name}`}
                          className="aspect-[3/4] w-full rounded-xl object-cover shadow-sm transition-transform group-hover:-translate-y-1"
                        />
                      ) : (
                        <div
                          className="flex aspect-[3/4] items-end rounded-xl p-4 shadow-sm transition-transform group-hover:-translate-y-1"
                          style={{ backgroundColor: shelf.books[0].cover_color }}
                        >
                          <Folder className="h-8 w-8 text-white/90" />
                        </div>
                      )}
                      <h3 className="mt-3 truncate text-base font-semibold">{shelf.name}</h3>
                      <p className="mt-1 text-sm text-stone-500">{shelf.books.length} sách</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
            </div>
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
            <h1 className={`text-xl font-semibold ${textPrimary}`}>Your library is empty</h1>
            <p className={`mt-2 text-sm ${textSecondary}`}>Add a PDF or EPUB to start reading.</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${activeChapter} transition-colors`}
          >
            <Upload className="h-4 w-4" />
            Add PDF / EPUB
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
        <p className={`text-lg ${textPrimary}`}>No chapters available.</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} flex flex-col transition-colors duration-300`}>
      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-30 ${headerBg} backdrop-blur-md border-b ${border} transition-colors duration-300`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 h-12">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Open chapter list"
            >
              <List className={`w-5 h-5 ${textPrimary}`} />
            </button>
            <button
              onClick={() => {
                setSelectedShelfKey(null);
                setReaderOpen(false);
              }}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Back to library"
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
              aria-label="Reading settings"
            >
              <Type className={`w-5 h-5 ${textPrimary}`} />
            </button>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-lg ${hover} transition-colors`}
              aria-label="Toggle dark mode"
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
              aria-label="Sign out"
              title={user.email || 'Sign out'}
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
              Font Size
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
              Theme
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors ${
                  !isDark ? activeChapter : `${hover} ${textPrimary}`
                }`}
              >
                <Sun className="w-4 h-4" /> Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors ${
                  isDark ? activeChapter : `${hover} ${textPrimary}`
                }`}
              >
                <Moon className="w-4 h-4" /> Dark
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
          <h2 className={`text-sm font-semibold ${textPrimary}`}>Library</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className={`p-1.5 rounded-lg ${hover} transition-colors`}
            aria-label="Close sidebar"
          >
            <X className={`w-5 h-5 ${textPrimary}`} />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
          <div className="p-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full mb-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${activeChapter} transition-colors`}
            >
              <Upload className="w-4 h-4" />
              Add PDF / EPUB files
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
                Books
              </p>
              <div className="space-y-2">
                {sortedShelves.map(([shelfKey, shelf]) => {
                  const isOpen = openShelves[shelfKey] !== false;
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
                                onClick={() => void handleDelete(libraryBook)}
                                className={`shrink-0 rounded-lg p-2 ${hover} transition-colors`}
                                aria-label={`Delete ${libraryBook.title}`}
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
            {book.file_type !== 'pdf' && (
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
        className={`flex-1 overflow-y-auto scrollbar-thin pt-12 pb-16 transition-colors duration-300`}
      >
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-8 sm:py-10">
          {book.file_type === 'pdf' && book.file_path && getBookUrl(book) ? (
            <iframe
              title={book.title}
              src={getBookUrl(book) ?? undefined}
              className="h-[calc(100vh-7rem)] min-h-[32rem] w-full border-0"
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
                className={`reading-content ${textPrimary}`}
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
                  <span className="hidden sm:inline">Previous</span>
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
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </nav>
            </article>
          ) : null}
        </div>
      </main>

      {/* Reading progress bar */}
      <div className="fixed bottom-0 left-0 right-0 h-0.5 z-20">
        <div
          className="h-full transition-all duration-150"
          style={{
            width: `${scrollProgress}%`,
            backgroundColor: book.cover_color,
          }}
        />
      </div>
    </div>
  );
}
