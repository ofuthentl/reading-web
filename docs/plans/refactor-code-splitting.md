# Kế hoạch Refactor — Code-Splitting, Tách `parsers.ts`, Bảo mật HTML & D-008

> **Trạng thái:** Đã hoàn tất triển khai Phase 1 → 4 & vượt qua toàn bộ Checklist kiểm thử Mục 5 — sẵn sàng mở PR merge vào `main`.
> **Nhánh triển khai:** `refactor/code-splitting` (tách mới từ `origin/main` sau khi Phase 3 đã merge qua PR #1; đã bỏ upstream tracking `origin/main`).
> **Ràng buộc liên quan:** `AGENTS.md` (mọi file ≤ 500 dòng hiệu dụng, không sửa trực tiếp trên `main`, tra "Công cụ đã có" trước khi tạo helper mới, cập nhật `ARCHITECTURE.md` ở mọi commit đổi cấu trúc và `HANDOFF.md` ở mọi commit), `docs/DECISIONS.md` (`D-001` → `D-008`).

---

## 1. Bối cảnh & Số liệu Baseline

### Vấn đề hiện tại
- `src/lib/parsers.ts` đang **554 dòng tổng (~488–495 dòng hiệu dụng)**, chạm sát trần 500 dòng của ESLint `max-lines`, đồng thời ôm nhiều trách nhiệm (metadata tên file, nén ảnh bìa, loader PDF.js, làm sạch HTML, và parse 4 định dạng).
- `src/lib/parsers.ts` import tĩnh cả 3 engine đọc sách nặng (`jszip`, `pdfjs-dist`, `@lingo-reader/mobi-parser`). Đồng thời `src/lib/api.ts`, `src/components/UploadDropzone.tsx`, `src/hooks/useBookReader.ts` đều import tĩnh từ `parsers.ts`, và `src/components/ReaderView.tsx` import tĩnh `PdfReader.tsx` (lại import tĩnh `pdfjs-dist`). Khi người dùng vừa mở trang đăng nhập `AuthGate`, trình duyệt phải tải trọn 1 gói JS 918 kB dù chưa mở cuốn sách nào.
- **Lỗ hổng XSS cùng origin:** `src/components/ReaderView.tsx` dòng 383 chèn `content_html` trực tiếp bằng `dangerouslySetInnerHTML` trên trang chính, nên HTML độc hại trong EPUB/MOBI có thể chạy script cùng origin với ứng dụng (đọc được token đăng nhập trong `localStorage`). Hiện logic làm sạch HTML đang bị lặp giữa `parseEpubBlob` và `parseMobiBlob`, chỉ tự viết block-list sơ sài (sót `javascript:`/`vbscript:`, `<base>`, `<meta refresh>`, `<form action>`/`formaction`, SVG `<animate>`/`<set attributeName="href">`, `poster`, `data`...).
- **Chunk cũ sau deploy:** `.github/workflows/deploy.yml` dùng `peaceiris/actions-gh-pages` (không đặt `keep_files`), nên mỗi lần deploy các asset hash cũ bị xoá. Khi app dùng dynamic import, tab đang mở sẵn từ trước đợt deploy sẽ gặp 404 khi tải chunk lười; chỉ reset promise về `null` rồi thử lại sẽ không cứu được vì file đã bị xoá.

### Đo đạc Baseline (`npm run build` trên `origin/main` trước refactor)

| File trong `dist/assets/` | Kích thước raw | Kích thước gzip | Ghi chú |
|---|---:|---:|---|
| `index-*.js` | **918.12 kB** | **277.95 kB** | Gộp cả app + `pdfjs-dist` + `jszip` + `mobi-parser` (Vite cảnh báo > 500 kB) |
| `pdf.worker.min-*.mjs` | 1,265.41 kB | — | Web Worker riêng của PDF.js (chỉ nạp khi chạy PDF) |
| `index-*.css` | 41.70 kB | 8.32 kB | Stylesheet toàn ứng dụng |

### Mục tiêu ("Định nghĩa xong")
1. `docs/DECISIONS.md` ghi nhận chính thức quyết định **D-008** (theo QĐ-1) làm rào chắn kiến trúc trước khi làm Phase 4 (Thư viện 3D).
2. Entry `dist/assets/index-*.js` giảm xuống **< 350 kB** (gzip **< 115 kB**); mở trang đăng nhập và thư viện 2D **không** tải bất kỳ chunk nào của `parsers`, `jszip`, `mobi`, `pdfjs`, `PdfReader`. Riêng chunk `pdfjs-dist` tải lười có thể sát hoặc vượt 500 kB (`pdf.mjs` 860 kB chưa nén, `pdf.min.mjs` 459 kB): nếu cảnh báo `> 500 kB` chỉ còn đến từ chunk PDF tải lười thì chấp nhận và ghi rõ số đo; **không** tăng `chunkSizeWarningLimit` để che cảnh báo.
3. Mọi file `.ts`/`.tsx` trong toàn repo đều tách đúng trách nhiệm và thoải mái dưới trần 500 dòng hiệu dụng.
4. Cả EPUB và MOBI dùng chung `src/lib/sanitizeHtml.ts` dựa trên `dompurify` v3 (chỉ nằm trong chunk `parsers` tải lười), làm sạch **trước** khi thay `src`/`href` ảnh bằng `blob:` URL, chặn đầy đủ vector XSS cùng origin trong khi vẫn bảo toàn `style` inline, `data:image/*`, đường dẫn tương đối và `#anchor`.
5. Không vỡ ứng dụng khi chunk cũ bị xoá sau deploy: tự phát hiện lỗi tải chunk (`isChunkLoadError` + sự kiện `vite:preloadError` + `ErrorBoundary`) và tự tải lại trang đúng 1 lần qua `sessionStorage` (`reloadOnceForStaleChunk`).
6. `npm run typecheck`, `npm run lint`, `npm run build` đều **0 lỗi, 0 cảnh báo** (không sửa Worker trong kế hoạch này).
7. Hoàn thành toàn bộ checklist kiểm thử ở **Mục 5** và đồng bộ đầy đủ `docs/ARCHITECTURE.md` + `HANDOFF.md`.

---

## 2. Lộ trình từng Phase (mỗi phase = 1 commit nhỏ, độc lập)

> Quy ước theo `AGENTS.md` §7.4 & §8: **mọi commit** đều cập nhật `HANDOFF.md`; **mọi commit có thay đổi cấu trúc/module/dependency** đều cập nhật `docs/ARCHITECTURE.md` ngay trong cùng commit đó.

### Phase 1 — Ghi quyết định D-008 vào `docs/DECISIONS.md`
- **Mục tiêu:** Chốt quy tắc kỹ thuật cho Thư viện 3D trên Desktop và đảm bảo mobile tuyệt đối không tải bundle 3D.
- **File sửa:**
  1. `docs/DECISIONS.md`: thêm dòng **D-008** với nguyên văn nội dung đã chốt:
     - **Quyết định:** Thư viện 3D (`FantasyLibrary3D`) chỉ bật khi thiết bị đạt đủ cả 3 điều kiện: (1) viewport `>= 1024px`; (2) `matchMedia('(hover: hover) and (pointer: fine)')`; (3) tạo được WebGL context với `{ failIfMajorPerformanceCaveat: true }` — chỉ thử tạo context **sau khi** (1) và (2) đã đạt để mobile không phải tạo context nào. Mặc định dùng 2D khi `prefers-reduced-motion: reduce`. Có công tắc 2D/3D thủ công lưu trong `localStorage`; công tắc chỉ hiện khi thiết bị đạt đủ điều kiện và lựa chọn 2D của người dùng luôn được tôn trọng. iPad có trackpad/Magic Keyboard đạt đủ 3 điều kiện được vào 3D (chấp nhận, vẫn có công tắc về 2D). Nếu giữa phiên không còn đạt điều kiện (ví dụ thu nhỏ cửa sổ dưới `1024px`): chuyển hiển thị sang 2D, **không** gỡ chunk 3D đã tải, không mount lại liên tục; khi đạt lại điều kiện cho phép quay về 3D mà không tải lại chunk. Thiết bị không đạt (mobile/tablet cảm ứng): tuyệt đối không tải `three`, `@react-three/fiber`, `@react-three/drei`; bắt buộc nạp qua `React.lazy` + dynamic import sau bước kiểm tra điều kiện. Thiết kế giao diện 3D / trình đọc trong 3D (ví dụ "sách mở đôi 2 trang") **không** thuộc ADR này, để dành cho plan Phase 4 (3D).
     - **Lý do:** Giữ trang mở nhanh; tiết kiệm pin, RAM, băng thông trên di động (`three` + `fiber` + `drei` > 600 kB); tránh WebGL giật lag hoặc chạy bằng CPU trên máy yếu; người dùng luôn có lối thoát về 2D.
     - **Phương án đã loại:** Chạy 3D thu gọn trên mọi thiết bị; import tĩnh Three.js rồi ẩn bằng CSS (`hidden lg:block`); nhận diện thiết bị bằng user-agent; chỉ dựa vào bề rộng màn hình.
  2. `HANDOFF.md`: cập nhật tiến độ sau Phase 1.
- **Rủi ro:** Không ảnh hưởng runtime code.
- **Cách hoàn tác:** `git revert <commit-phase-1>`.

---

### Phase 2 — Tách `parsers.ts` đúng trách nhiệm, DOMPurify, Dynamic Import & Xử lý Chunk cũ
- **Mục tiêu:** Tách nhỏ theo đúng trách nhiệm (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml`, `chunkReload`), cài `dompurify` vá XSS cho EPUB/MOBI, chuyển 3 engine đọc sách + `parsers.ts` sang dynamic import, và thêm cơ chế chống vỡ trang khi chunk cũ 404 sau deploy.
- **Chuẩn bị bắt buộc:** Trước khi tạo helper mới, tra mục "Công cụ đã có — cấm viết lại" trong `docs/ARCHITECTURE.md` để bảo đảm không viết trùng.
- **Dependency mới:** Cài `dompurify` (v3, đã kèm type TypeScript). Chỉ import duy nhất trong `src/lib/sanitizeHtml.ts` để nằm gọn trong chunk `parsers` tải lười, tuyệt đối không lọt vào bundle khởi động.
- **File tạo mới:**
  1. **`src/lib/bookMetadata.ts`** (~80 dòng):
     - Chứa các hàm thuần metadata (không phụ thuộc Canvas hay thư viện parse):
       - `pickCoverColor(seed)` (+ `ARCANE_COVER_PALETTE`)
       - `inferShelfName(title, author)` (uỷ quyền `inferSingleBookShelf` từ `@/lib/shelfPlacement`)
       - `parseFileMetadata(fileName)` (+ `VOLUME_SEGMENT_RE`)
       - `bookDuplicateKey(title, author)`
     - **Không** chứa `compressCoverBlob`.
  2. **`src/lib/coverImage.ts`** (~45 dòng):
     - Export `compressCoverBlob(source: Blob): Promise<Blob>` (crop tâm & nén JPEG `480×720`, giải phóng `ImageBitmap` trong `finally`).
  3. **`src/lib/pdfjsLoader.ts`** (~30 dòng):
     - Export `pdfWasmUrl = \`${import.meta.env.BASE_URL}pdfjs-wasm/\``.
     - Export `loadPdfJs()`: cache promise gọi `import('pdfjs-dist')`, thiết lập `GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()` (giữ chuỗi literal tĩnh để Vite emit `pdf.worker.min-*.mjs`), đặt lại cache về `null` khi lỗi và gọi `reloadOnceForStaleChunk()` nếu `isChunkLoadError(err)`.
     - Cả `src/lib/parsers.ts` và `src/components/PdfReader.tsx` đều import từ đây; `PdfReader.tsx` **không** import `parsers.ts`.
  4. **`src/lib/sanitizeHtml.ts`** (~50 dòng):
     - Import `DOMPurify` từ `dompurify`.
     - Export `sanitizeBookDocument(doc: Document): void`.
     - Cách làm: `if (!doc.body) return; doc.body.innerHTML = DOMPurify.sanitize(doc.body.innerHTML, config);`. **Không** dùng `IN_PLACE` (vì root là `<body>` có thể bị DOMPurify từ chối khi sanitize in-place).
     - Cấu hình `DOMPurify`:
       - `FORBID_TAGS`: `['script', 'style', 'iframe', 'object', 'embed', 'link', 'base', 'meta', 'form', 'frame', 'frameset', 'animate', 'set', 'animateMotion', 'animateTransform']`.
       - Giữ thuộc tính `style` inline.
       - Giữ `data:image/*` trên `<img>` và `<svg><image>` (xác minh hành vi thực tế của DOMPurify v3 với `data:image/*`, đường dẫn tương đối `../Images/*`, `#anchor`, `href`/`xlink:href` trên SVG `image`; cấu hình `ALLOWED_URI_REGEXP` hoặc hook tối thiểu nếu mặc định bị chặn).
     - **Thứ tự bắt buộc:** phải gọi `sanitizeBookDocument(doc)` **trước** bước thay `src`/`href` ảnh bằng `blob:` URL, vì DOMPurify mặc định gỡ URL `blob:`.
  5. **`src/lib/chunkReload.ts`** (~40 dòng):
     - Export `isChunkLoadError(err: unknown): boolean`: nhận diện lỗi chunk theo chuỗi `"Failed to fetch dynamically imported module"`, `"Importing a module script failed"`, `"error loading dynamically imported module"`.
     - Export `reloadOnceForStaleChunk(): boolean`: lưu một khoá trong `sessionStorage` để tự `window.location.reload()` tối đa 1 lần khi chunk cũ bị xoá sau deploy (ngăn lặp tải trang vô hạn).
- **File sửa:**
  6. **`src/lib/parsers.ts`** (giảm còn ~330–350 dòng):
     - Bỏ 3 static import (`jszip`, `pdfjs-dist`, `@lingo-reader/mobi-parser`) và khối khởi tạo `GlobalWorkerOptions.workerSrc`.
     - Import `compressCoverBlob` từ `@/lib/coverImage`, `loadPdfJs` & `pdfWasmUrl` từ `@/lib/pdfjsLoader`, `sanitizeBookDocument` từ `@/lib/sanitizeHtml`, `isChunkLoadError` & `reloadOnceForStaleChunk` từ `@/lib/chunkReload`.
     - Giữ `loadJSZip()` và `loadMobiParser()` (cache promise, reset về `null` khi lỗi, kiểm tra `isChunkLoadError` → `reloadOnceForStaleChunk()`), cùng `extractCoverAtUpload(file, fileType)` và `parseBookBlob(blob, book)`.
     - Gọi `sanitizeBookDocument(doc)` trong `parseEpubBlob` (**trước** khi resolve ảnh `blob:`) và trong `parseMobiBlob`.
  7. **`src/lib/api.ts`**:
     - Đổi import `parseFileMetadata`, `pickCoverColor` sang `@/lib/bookMetadata`; `compressCoverBlob` sang `@/lib/coverImage`.
     - Trong `uploadBook()`: thay static import `extractCoverAtUpload` bằng `await import('@/lib/parsers')` (bọc xử lý `isChunkLoadError` → `reloadOnceForStaleChunk()`).
  8. **`src/components/UploadDropzone.tsx`**:
     - Đổi import `bookDuplicateKey`, `parseFileMetadata` sang `@/lib/bookMetadata`.
  9. **`src/hooks/useBookReader.ts`**:
     - Trong `openBook()`: thay static import `parseBookBlob` bằng `await import('@/lib/parsers')` (giữ kiểm tra `requestId`, bọc xử lý `isChunkLoadError` → `reloadOnceForStaleChunk()`).
  10. **`src/main.tsx`**:
      - Đăng ký `window.addEventListener('vite:preloadError', (event) => { if (reloadOnceForStaleChunk()) event.preventDefault(); })`.
  11. **`package.json` & `package-lock.json`**: thêm dependency `dompurify`.
  12. **`docs/ARCHITECTURE.md`** *(cập nhật ngay trong commit Phase 2 theo `AGENTS.md` §7.4)*: thêm 5 module mới vào Mục 2, cập nhật phụ thuộc của `parsers.ts`, `api.ts`, `useBookReader.ts`, `UploadDropzone.tsx`, `main.tsx`, ghi thêm dependency `dompurify`, và cập nhật Mục 6 ("Công cụ đã có — cấm viết lại").
  13. **`HANDOFF.md`** *(cập nhật ngay trong commit Phase 2 theo `AGENTS.md` §8)*.
- **Kiểm thử độc lập:** `npm run typecheck`, `npm run lint`, `npm run build`; xác nhận `dist/assets/` đã tách `parsers`, `jszip`, `mobi-parser` khỏi `index-*.js`, và `dompurify` không nằm trong `index-*.js`.
- **Rủi ro & giảm thiểu:**
  - *Vite không emit `pdf.worker.min-*.mjs`:* giữ literal tĩnh trong `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` và xác nhận file trong `dist/assets/` sau build.
  - *DOMPurify gỡ nhầm `blob:` hoặc `data:image/*` hoặc làm mất `<svg><image>` đường dẫn tương đối:* ép thứ tự gọi `sanitizeBookDocument(doc)` **trước** bước thay `blob:` URL; kiểm thử trực tiếp với EPUB độc hại tự tạo (có ảnh `data:image/png`, ảnh tương đối `../Images/*`, và `<svg><image>`) + EPUB thật nhiều ảnh + MOBI thật.
  - *Chunk cũ 404 sau deploy:* xử lý đồng bộ ở `chunkReload.ts` + `vite:preloadError`, dùng `sessionStorage` chặn vòng lặp reload.
- **Cách hoàn tác:** `git revert <commit-phase-2>`.

---

### Phase 3 — Lazy-load `PdfReader.tsx` trong `ReaderView.tsx`
- **Mục tiêu:** Không kéo `PdfReader.tsx` và `pdfjs-dist` vào bundle chính hay khi người dùng chỉ đọc EPUB/MOBI/CBZ; bảo vệ chống lỗi chunk cũ khi tải `LazyPdfReader`.
- **File sửa:**
  1. **`src/components/PdfReader.tsx`**:
     - Đổi `import * as pdfjsLib from 'pdfjs-dist'` sang `import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'`.
     - Import `{ loadPdfJs, pdfWasmUrl } from '@/lib/pdfjsLoader'` (**không** import `parsers.ts`).
     - Trong `useEffect` nạp tài liệu PDF: `await loadPdfJs()`, kiểm tra `if (cancelled) return;` rồi mới gọi `getDocument({ url, wasmUrl: pdfWasmUrl })`; luôn huỷ `loadingTask.destroy()` khi cleanup (kể cả khi người dùng đóng PDF đúng lúc chunk đang tải).
     - Giữ named export `export function PdfReader(...)` để tránh cảnh báo `react-refresh/only-export-components`.
  2. **`src/components/ReaderView.tsx`**:
     - Bỏ static import `PdfReader`.
     - Khai báo `const LazyPdfReader = lazy(() => import('@/components/PdfReader').then((m) => ({ default: m.PdfReader })));`.
     - Bọc `<LazyPdfReader ... />` trong `<Suspense fallback={...}>` với giao diện loading đồng bộ 3 chế độ màu (`bg-canvas text-ink-muted` + `Loader2` xoay "Đang tải trình đọc PDF...").
  3. **`src/components/ErrorBoundary.tsx`** *(hoặc boundary riêng quanh `LazyPdfReader`)*:
     - Khi bắt lỗi `isChunkLoadError(error)`, gọi `reloadOnceForStaleChunk()` để tự khôi phục đúng 1 lần thay vì kẹt màn hình lỗi nếu chunk `PdfReader` cũ đã bị xoá sau deploy.
  4. **`docs/ARCHITECTURE.md`** *(cập nhật ngay trong commit Phase 3 theo `AGENTS.md` §7.4)*: cập nhật mô tả & phụ thuộc của `PdfReader.tsx`, `ReaderView.tsx`, `ErrorBoundary.tsx` ở Mục 2.
  5. **`HANDOFF.md`** *(cập nhật ngay trong commit Phase 3 theo `AGENTS.md` §8)*.
- **Kiểm thử độc lập:** `npm run typecheck`, `npm run lint`, `npm run build`; xác nhận `index-*.js` < 350 kB (gzip < 115 kB), `PdfReader` + `pdfjs-dist` tách hẳn sang chunk tải lười.
- **Rủi ro & giảm thiểu:**
  - *Đóng PDF khi chunk `PdfReader` / `pdfjs-dist` đang tải:* kiểm tra cờ `cancelled` trước và sau `await loadPdfJs()` và huỷ `loadingTask.destroy()` trong cleanup.
  - *Chunk `PdfReader` cũ bị 404 sau deploy:* `ErrorBoundary` gọi `isChunkLoadError` + `reloadOnceForStaleChunk()`.
- **Cách hoàn tác:** `git revert <commit-phase-3>`.

---

### Phase 4 — Rà soát Tài liệu & Đo đạc Chunk
- **Mục tiêu:** Đo đạc chính xác toàn bộ chunk JS sau refactor, hoàn thiện rà soát `docs/ARCHITECTURE.md` và `HANDOFF.md`, hoàn thành checklist Mục 5 trước khi mở PR vào `main`. *(Không sửa `workers/r2-storage/wrangler.toml`, không phải deploy Worker — theo QĐ-2.)*
- **Công việc & file sửa:**
  1. Chạy kiểm định cuối (`npm run typecheck`, `npm run lint`, `npm run build`) và điền số liệu thực tế vào **Bảng B (Mục 5)** của file plan này.
  2. Rà soát toàn diện **`docs/ARCHITECTURE.md`**:
     - **Mục 1 (Sơ đồ tổng thể):** cập nhật phản ánh phân tách metadata/cover/pdfjs/sanitize/chunkReload & tải lười.
     - **Mục 2 (Bảng module):** xác nhận đủ `bookMetadata.ts`, `coverImage.ts`, `pdfjsLoader.ts`, `sanitizeHtml.ts`, `chunkReload.ts`; đúng phụ thuộc của `parsers.ts`, `api.ts`, `useBookReader.ts`, `UploadDropzone.tsx`, `PdfReader.tsx`, `ReaderView.tsx`, `ErrorBoundary.tsx`, `main.tsx`; có ghi nhận dependency `dompurify`.
     - **Mục 6 (Công cụ đã có):** xác nhận đã dời vị trí các hàm đúng file, đã thêm `sanitizeBookDocument`, `loadPdfJs`, `isChunkLoadError` / `reloadOnceForStaleChunk`.
     - **Mục 7 (Trạng thái hiện tại):** viết lại hoàn toàn (hiện đang dừng ở Sub-phase 3.4 đã lỗi thời) phản ánh Phase 3 đã merge vào `main` và hoàn tất `refactor/code-splitting`.
  3. Cập nhật **`HANDOFF.md`** (gọn < 60 dòng, không ghi hash commit) sẵn sàng mở PR `refactor/code-splitting` → `main`.
- **Rủi ro:** Quên cập nhật 1 mục chéo trong `ARCHITECTURE.md`. **Giảm thiểu:** đối chiếu trực tiếp bảng module với `git diff --name-only origin/main`.
- **Cách hoàn tác:** `git revert <commit-phase-4>`.

---

## 3. Quyết định đã chốt (2026-11-21)

| ID | Nội dung / Phương án chọn | Lý do | Phương án đã loại | Điểm yếu chấp nhận |
|---|---|---|---|---|
| **QĐ-1** | **D-008:** 3D (`FantasyLibrary3D`) chỉ bật khi đủ 3 điều kiện: viewport `>= 1024px`, `(hover: hover) and (pointer: fine)`, và WebGL context `{ failIfMajorPerformanceCaveat: true }` (chỉ thử sau khi 2 điều kiện đầu đạt). Mặc định 2D khi `prefers-reduced-motion: reduce`; có công tắc 2D/3D lưu `localStorage`; mất điều kiện giữa phiên thì chuyển 2D nhưng không gỡ chunk 3D; mobile tuyệt đối không tải `three`/`fiber`/`drei` (`React.lazy`). Giao diện đọc trong 3D để cho plan Phase 4. | Giữ trang mở nhanh; tiết kiệm pin/RAM/băng thông di động (> 600 kB); tránh WebGL chạy phần mềm/giật lag trên máy yếu; người dùng luôn có lối thoát 2D. | Chạy 3D thu gọn trên mọi thiết bị; import tĩnh Three.js rồi ẩn bằng CSS; nhận diện bằng user-agent; chỉ kiểm tra bề rộng màn hình. | iPad gắn trackpad/Magic Keyboard đạt đủ 3 điều kiện vẫn có thể vào 3D (chấp nhận vì có công tắc về 2D); thu nhỏ cửa sổ giữa phiên giữ lại chunk 3D trong RAM trình duyệt đến khi đóng tab. |
| **QĐ-2** | **`APP_ORIGINS` — Phương án C:** Giữ nguyên `workers/r2-storage/wrangler.toml` (`https://ofu.lol,http://localhost:5173,http://127.0.0.1:5173`). | `https://www.ofu.lol` đã trả `301` về `https://ofu.lol/` (GitHub Pages) nên origin `www` không bao giờ gọi API; không cần cổng `4173` vì chạy `npm run preview -- --port 5173 --strictPort`; tránh sửa và deploy Worker thủ công. | **Phương án A** (thêm `www.ofu.lol` & cổng `4173`): thừa vì `www` đã redirect 301 và tốn 1 bước deploy Worker thủ công. **Phương án B** (tách `[env.dev]` chỉ giữ `ofu.lol` ở prod): tăng phức tạp vận hành local (phải chạy `wrangler dev` + `.dev.vars` khi test). | Khi chạy `npm run preview` phải nhớ truyền `-- --port 5173 --strictPort` thay vì dùng cổng mặc định `4173`. |
| **QĐ-3** | **Mức tách `parsers.ts` — Phương án 1:** Đổi `extractCoverAtUpload` (trong `api.ts`) và `parseBookBlob` (trong `useBookReader.ts`) sang `await import('@/lib/parsers')`. | Tách triệt để `parsers.ts`, `epubChapters.ts`, `sanitizeHtml.ts`, và `dompurify` khỏi bundle đăng nhập/thư viện 2D. | **Phương án 2** (giữ static import `extractCoverAtUpload` / `parseBookBlob`): để lọt code parser + `dompurify` vào bundle khởi động. | Lần đầu mở sách hoặc upload phát sinh thêm 1 request tải chunk `parsers-*.js` (được browser cache sau đó). |
| **QĐ-4** | **Làm sạch HTML bằng `DOMPurify` v3:** Thêm `dompurify`, chỉ import trong `src/lib/sanitizeHtml.ts`. API `sanitizeBookDocument(doc)` gán `doc.body.innerHTML = DOMPurify.sanitize(doc.body.innerHTML, config)` (không dùng `IN_PLACE`), gọi **trước** khi thay ảnh bằng `blob:` URL. | `ReaderView.tsx:383` dùng `dangerouslySetInnerHTML` trên origin chính nên XSS đọc được token đăng nhập; `DOMPurify` chặn trọn vẹn các vector phức tạp mà block-list tay dễ sót. | Tự viết block-list tay (sót `<base>`, `<meta refresh>`, `<form action>`/`formaction`, SVG `<animate>`/`<set attributeName="href">`, `poster`, `data`); tự viết allow-list (tốn công bảo trì, dễ sót). | Thêm 1 dependency (~8 kB gzip, chỉ nằm trong chunk `parsers` tải lười); phải giữ chặt thứ tự sanitize trước khi thay `blob:` URL. |
| **QĐ-5** | **Tách module đúng trách nhiệm (`AGENTS.md` §5):** `bookMetadata.ts` (metadata thuần), `coverImage.ts` (`compressCoverBlob`), `pdfjsLoader.ts` (`loadPdfJs` + `pdfWasmUrl`), `sanitizeHtml.ts`, `chunkReload.ts`, `parsers.ts` (`loadJSZip`, `loadMobiParser`, `extractCoverAtUpload`, `parseBookBlob`). | Mỗi file 1 trách nhiệm duy nhất, `PdfReader.tsx` không phụ thuộc `parsers.ts`, `bookMetadata.ts` không dính Canvas/DOM. | Nhét `compressCoverBlob` vào `bookMetadata.ts` hoặc để `loadPdfJs` trong `parsers.ts` khiến `PdfReader` kéo theo cả `parsers.ts`. | Tăng số lượng file nhỏ trong `src/lib/` (nhưng dễ đọc, dễ bảo trì và tree-shake sạch). |
| **QĐ-6** | **Xử lý chunk cũ sau deploy (`src/lib/chunkReload.ts` + `vite:preloadError` + `ErrorBoundary`):** Tự nhận diện lỗi tải chunk và reload đúng 1 lần (chặn lặp vô hạn qua `sessionStorage`). | `deploy.yml` dùng `peaceiris/actions-gh-pages` không có `keep_files` nên asset cũ bị xoá sau mỗi lần deploy; reset promise về `null` không thể cứu 404. | Chỉ reset promise về `null` khi lỗi mạng (vẫn vỡ 404 sau deploy); bật `keep_files: true` (làm phình vô hạn nhánh `gh-pages`). | Người dùng đang mở tab cũ sẽ thấy trang tự tải lại 1 lần khi bấm mở sách ngay sau đợt deploy mới (trạng thái UI chưa lưu sẽ mất, tiến độ đọc đã lưu vẫn giữ). |
| **QĐ-7** | **Tiêu chí bundle:** Entry `index-*.js` < 350 kB (gzip < 115 kB); không tải parser/PDF khi ở `AuthGate`/Thư viện 2D. Chấp nhận cảnh báo > 500 kB nếu chỉ đến từ chunk `pdfjs-dist` tải lười; cấm tăng `chunkSizeWarningLimit`. | Bản thân `pdfjs-dist` lớn (`pdf.mjs` 860 kB raw / `pdf.min.mjs` 459 kB) và chỉ tải khi người dùng thực sự dùng PDF; không che giấu cảnh báo của Vite để phát hiện sớm phình bundle sau này. | Tăng `build.chunkSizeWarningLimit` để tắt cảnh báo; hoặc tự chia nhỏ ruột `pdfjs-dist` thiếu ổn định. | Log `npm run build` vẫn có thể hiện 1 cảnh báo `> 500 kB` riêng cho chunk PDF tải lười. |

---

## 4. Tổng hợp Rủi ro & Cách hoàn tác

| Rủi ro | Mức độ | Biện pháp giảm thiểu | Cách hoàn tác |
|---|---|---|---|
| Chunk cũ 404 sau deploy (`peaceiris/actions-gh-pages` xoá asset cũ) | Cao | Tạo `src/lib/chunkReload.ts` (`isChunkLoadError`, `reloadOnceForStaleChunk` dùng `sessionStorage`), gắn vào mọi dynamic import, `vite:preloadError` (`main.tsx`) và `ErrorBoundary`; kiểm thử thực tế ở Mục 5 | `git revert <commit-phase-2>` |
| `DOMPurify` gỡ nhầm URL `blob:` hoặc ảnh nhúng `data:image/*` | Cao | Bắt buộc gọi `sanitizeBookDocument(doc)` **trước** bước resolve `blob:` URL; kiểm thử thực tế với ảnh `data:image/png` và ảnh nội bộ EPUB | `git revert <commit-phase-2>` |
| `DOMPurify` làm mất ảnh `<svg><image>` đường dẫn tương đối (`href` / `xlink:href`) | Trung bình | Kiểm thử với EPUB chứa `<svg><image>` tương đối (`../Images/*`) và kiểm tra cấu hình thẻ/thuộc tính SVG của `DOMPurify` trước khi chốt Phase 2 | `git revert <commit-phase-2>` |
| Vite không emit `pdf.worker.min-*.mjs` khi chuyển sang `pdfjsLoader.ts` | Trung bình | Giữ literal tĩnh trong `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` và xác nhận file trong `dist/assets/` sau build | `git revert <commit-phase-2>` |
| `PdfReader` đóng sớm khi `loadPdfJs()` đang chạy gây rò rỉ `loadingTask` | Trung bình | Kiểm tra cờ `cancelled` trước/sau `await loadPdfJs()` và luôn gọi `loadingTask.destroy()` trong cleanup | `git revert <commit-phase-3>` |
| Chunk PDF tải lười (`pdfjs-dist`) sát hoặc vượt ngưỡng 500 kB | Thấp | Chấp nhận theo QĐ-7 nếu entry `index-*.js` < 350 kB và cảnh báo chỉ thuộc chunk PDF tải lười; không tăng `chunkSizeWarningLimit`; ghi rõ số đo ở Bảng B | Không cần hoàn tác (đã chốt QĐ-7) |

---

## 5. Checklist kiểm thử (bắt buộc qua hết trước khi kết thúc)

### A. Kiểm định tự động (CI cục bộ)
- [x] `npm run typecheck` — 0 lỗi.
- [x] `npm run lint` — 0 lỗi, 0 cảnh báo (mọi file `.ts`/`.tsx` đều ≤ 500 dòng hiệu dụng).
- [x] `npm run build` — 0 lỗi, **0 cảnh báo chunk > 500 kB** (`index-*.js` = **259.77 kB** / gzip **76.92 kB**, không thay đổi `chunkSizeWarningLimit`; còn 1 cảnh báo upstream đã biết `Module "stream" has been externalized for browser compatibility` từ `node_modules/sax/lib/sax.js` qua chuỗi `@lingo-reader/mobi-parser` → `@lingo-reader/shared` → `sax`, không thêm alias/stub khi chưa có yêu cầu).
- [x] `cd workers/r2-storage && npx tsc --noEmit` — 0 lỗi.

### B. So sánh dung lượng chunk JS trong `dist/assets/` (Trước vs Sau)

| Chunk / Asset | Trước refactor (Baseline) | Sau refactor (Số đo thực tế) | Mục tiêu kỳ vọng |
|---|---:|---:|---|
| `index-*.js` (entry chính) | **918.12 kB** (gzip **277.95 kB**) | **259.77 kB** (gzip **76.92 kB**) | **< 350 kB** (gzip **< 115 kB**), không chứa `dompurify`/parser ✅ |
| Chunk `parsers-*.js` *(gồm `sanitizeHtml` + `dompurify` + `epubChapters`)* | _(gộp trong `index`)_ | **44.55 kB** (gzip **17.18 kB**) | Tách riêng (~35–55 kB raw, ~12–20 kB gzip) ✅ |
| Chunk `jszip.min-*.js` | _(gộp trong `index`)_ | **97.58 kB** (gzip **30.34 kB**) | Tách riêng (~95–105 kB) ✅ |
| Chunk `index.browser-*.js` (`@lingo-reader/mobi-parser`) | _(gộp trong `index`)_ | **66.81 kB** (gzip **23.53 kB**) | Tách riêng ✅ |
| Chunk `PdfReader-*.js` | _(gộp trong `index`)_ | **8.42 kB** (gzip **2.87 kB**) | Tách riêng (~10–20 kB) ✅ |
| Chunk `pdf-*.js` (`pdfjs-dist` tải lười) | _(gộp trong `index`)_ | **483.23 kB** (gzip **144.28 kB**) | Tách riêng; dưới 500 kB raw (0 cảnh báo) ✅ |
| Chunk `pdfjsLoader-*.js` | _(gộp trong `index`)_ | **0.32 kB** (gzip **0.27 kB**) | Tách riêng ✅ |
| Chunk `_commonjsHelpers-*.js` | _(gộp trong `index`)_ | **0.69 kB** (gzip **0.38 kB**) | Helper dùng chung cho chunk động ✅ |
| `pdf.worker.min-*.mjs` | 1,265.41 kB | **1,265.41 kB** | Vẫn emit đầy đủ ✅ |
| `index-*.css` | 41.70 kB (gzip 8.32 kB) | **41.72 kB** (gzip **8.32 kB**) | Ổn định ✅ |
| `three` / `@react-three/*` | 0 kB (chưa import) | **0 kB** | Xác nhận không bị kéo vào bundle ✅ |

### C. Kiểm thử chức năng, Bảo mật & Network trên trình duyệt
Chạy bản build production cục bộ bằng lệnh chuẩn:
```bash
npm run build && npm run preview -- --port 5173 --strictPort
```

- [x] **Preview ở cổng 5173 đăng nhập Worker live OK:** Mở `http://localhost:5173`, đăng nhập passcode thành công vào Worker thật (khớp `APP_ORIGINS` giữ nguyên theo QĐ-2).
- [x] **Tab Network ở trang đăng nhập `AuthGate` & Thư viện 2D:** Mở DevTools Network (lọc JS):
  - Ở màn hình `AuthGate`: chỉ tải `index-*.js`; **không** tải `parsers`, `dompurify`, `jszip`, `mobi-parser`, `pdfjs-dist`, `PdfReader`, `pdf.worker`.
  - Sau khi đăng nhập vào Thư viện 2D: khi trình duyệt rảnh (`requestIdleCallback` / `1500ms`), tải nền `parsers-*.js` + `jszip.min-*.js` để sẵn sàng đọc EPUB/CBZ offline; vẫn **không** tải `index.browser-*.js` (MOBI), `PdfReader-*.js`, `pdf-*.js`, hay `pdf.worker.min-*.mjs`.
- [x] **Kiểm thử đọc Offline (không reload mất tab):**
  - Sau khi vào Thư viện 2D (chunk `parsers` + `jszip` đã preload và đã có ít nhất 1 cuốn EPUB trong cache IndexedDB), bật DevTools Network → **Offline**.
  - Bấm mở cuốn EPUB đã cache → mở đọc tức thì (`Cache 0ms`), **không** tự reload làm mất trang.
  - Đóng sách, vẫn để **Offline**, bấm mở 1 cuốn PDF hoặc MOBI (chưa tải chunk `pdf-*.js` / `index.browser-*.js`) → hiện thông báo lỗi rõ ràng (`"Cần kết nối mạng để tải trình đọc lần đầu."`), **không** reload làm mất tab.
- [x] **Kiểm thử Fallback lỗi PDF cục bộ (`PdfReaderFallback`):**
  - Tắt Offline, vào DevTools Network → **Block request URL**, thêm mẫu chặn `*pdf-*.js` (hoặc `*PdfReader-*.js`), rồi bấm mở 1 cuốn PDF.
  - Hiển thị thẻ lỗi `PdfReaderFallback` ngay bên trong khung đọc (kèm nút "Tải lại trang" và "Đóng sách"); bấm **"Đóng sách"** quay về Thư viện 2D bình thường, toàn bộ ứng dụng không bị sập. (Bỏ chặn URL sau khi test.)
- [x] **Đọc sách EPUB thật (nhiều ảnh minh hoạ):** ảnh minh hoạ đầu sách, giữa chương và ảnh `<svg><image>` hiển thị đầy đủ; đóng sách không rò rỉ `ObjectURL`.
- [x] **Đọc sách PDF:** hiển thị trạng thái `<Suspense>` mượt, sau đó tải chunk `PdfReader` + `pdfjsLoader` + `pdf-*.js` + `pdf.worker.min-*.mjs`; chuyển trang, zoom, thumbnail hoạt động bình thường; mở rồi đóng thật nhanh không báo lỗi console.
- [x] **Đọc sách MOBI thật & CBZ:** MOBI chỉ tải thêm `index.browser-*.js`, hiển thị đầy đủ văn bản & ảnh; CBZ dùng `jszip` đã có.
- [x] **Upload sách & đổi ảnh bìa:** upload thử EPUB/PDF trích bìa tự động thành công (`compressCoverBlob` từ `coverImage.ts`), phát hiện trùng lặp (`bookDuplicateKey`) và gợi ý kệ (`parseFileMetadata`) vẫn chính xác.
- [x] **Kiểm thử sanitizer (`DOMPurify`) với EPUB độc hại tự tạo tại máy (KHÔNG commit):**
  - Tạo 1 file EPUB thử nghiệm cục bộ chứa đủ các payload: `<script>`, `<style>`, `<iframe>`, `onclick="..."`, `<a href="javascript:alert(1)">`, `<a href="java&#x09;script:alert(1)">`, `<img src="vbscript:msgbox(1)">`, `<svg><image xlink:href="javascript:alert(1)"/></svg>`, `<base href="https://evil.example/">`, `<meta http-equiv="refresh" content="0;url=https://evil.example/">`, `<form action="javascript:alert(1)">`, `<button formaction="javascript:alert(1)">`, `<svg><a><animate attributeName="href" to="javascript:alert(1)"/></a></svg>`, `<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>`, kèm ảnh hợp lệ `<img src="data:image/png;base64,...">` và ảnh tương đối `../Images/*` (gồm cả `<img>` và `<svg><image>`).
  - *Kỳ vọng:* mở sách không chạy script, kiểm tra DOM thấy toàn bộ payload độc đã bị gỡ sạch, ảnh `data:image/png` và ảnh tương đối `../Images/*` đều hiển thị đầy đủ. Xoá file EPUB thử nghiệm khỏi máy/repo sau khi test (không commit).
- [x] **Kiểm thử chunk cũ 404 sau deploy (`chunkReload.ts`):**
  - Mở `http://localhost:5173` (đang chạy `npm run preview -- --port 5173 --strictPort`) và giữ nguyên tab ở màn hình Thư viện 2D.
  - Sửa tạm 1 dòng bất kỳ trong `src/components/PdfReader.tsx` rồi chạy lại `npm run build` để đổi hash chunk (không commit).
  - Ở tab cũ đang mở (đang Online), bấm mở 1 cuốn PDF → trang tự tải lại **đúng 1 lần** và không rơi vào vòng lặp reload vô hạn.
  - Hoàn tác thay đổi tạm bằng `git checkout -- src/components/PdfReader.tsx` và chạy lại `npm run build`.
