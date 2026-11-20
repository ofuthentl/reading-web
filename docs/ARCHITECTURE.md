# Kiến trúc hệ thống — Arcane Library (`ofu.lol`)

## 1. Sơ đồ tổng thể

```mermaid
flowchart LR
  Browser["Browser (React + Vite + TS)"]
  API["src/lib/api.ts"]
  Parsers["src/lib/parsers.ts"]
  Cache["src/lib/cache.ts"]
  IDB[("IndexedDB\n(blobs, covers, local state)")]
  Worker["Cloudflare Worker\nworkers/r2-storage/src/index.ts"]
  D1[("Cloudflare D1\n(books, reading_progress)")]
  R2[("Cloudflare R2\n(books/*, covers/*)")]

  Browser --> API
  Browser --> Parsers
  API --> Cache
  Cache <--> IDB
  API -- "HTTPS + Bearer HMAC token" --> Worker
  Worker --> D1
  Worker -- "R2 Native Binding" --> R2
```

## 2. Bảng module

| File | Trách nhiệm | Export chính | Phụ thuộc vào |
|---|---|---|---|
| `src/types.ts` | Định nghĩa kiểu dữ liệu dùng chung (Book, Chapter, ParsedBook, Progress, Storage, ReaderSettings) | `Book`, `BookFileType`, `Chapter`, `ParsedBook`, `ReadingProgress`, `StorageStats`, `ShelfGroup`, `ReaderSettings`, `ViewMode` | — |
| `src/lib/cache.ts` | Lớp truy cập IndexedDB (`arcane-library-cache-v1`) lưu cache file sách/bìa và dữ liệu chế độ local | `getCachedBookBlob`, `setCachedBookBlob`, `deleteCachedBookBlob`, `getCachedCoverBlob`, `setCachedCoverBlob`, `deleteCachedCoverBlob`, `getLocalBooks`, `putLocalBook`, `deleteLocalBook`, `getAllLocalProgress`, `putLocalProgress`, `deleteLocalProgress` | `src/types.ts`, IndexedDB API |
| `src/lib/parsers.ts` | Trích xuất metadata tên file, trích/nén ảnh bìa JPEG khi upload, parse EPUB/PDF/CBZ/MOBI thành `ParsedBook` kèm `dispose()` | `pdfWasmUrl`, `pickCoverColor`, `inferShelfName`, `parseFileMetadata`, `bookDuplicateKey`, `compressCoverBlob`, `extractCoverAtUpload`, `parseBookBlob` | `jszip`, `pdfjs-dist`, `@lingo-reader/mobi-parser`, `src/types.ts` |
| `src/lib/api.ts` | Giao tiếp HTTP với Worker, quản lý token, bảo vệ D-005 (chặn Local-First trên production), giới hạn 9.0 GiB, cache-first blob/cover, đồng bộ tiến độ đọc | `HARD_LIMIT_BYTES`, `isMissingProductionApi`, `isLocalDevMode`, `isCloudMode`, `getAuthToken`, `setAuthToken`, `formatBytes`, `sortBooksByTitle`, `groupBooksIntoShelves`, `isAuthError`, `checkHealth`, `loginWithPasscode`, `fetchLibraryState`, `uploadBook`, `updateBookMetadata`, `updateBookCover`, `renameShelfAll`, `deleteBooks`, `fetchBookBlobCached`, `fetchCoverBlobCached`, `saveReadingProgress`, `clearReadingProgress` | `src/types.ts`, `src/lib/cache.ts`, `src/lib/parsers.ts` |
| `src/hooks/useTheme.ts` | Quản lý chế độ Ban Ngày / Mặt Trời (`#f6f1e7`) ↔ Đêm Trăng / Mặt Trăng (`#0b0c12`) lưu `localStorage`, đồng bộ class `dark` & `meta[name="theme-color"]` | `useTheme`, `AppTheme` | React, `localStorage` |
| `src/hooks/useCoverUrl.ts` | Tải ảnh bìa từ IndexedDB/R2 qua `fetchCoverBlobCached`, tạo & thu hồi `URL.revokeObjectURL` đúng vòng đời | `useCoverUrl` | React, `src/lib/api.ts` |
| `src/hooks/useToast.ts` | Hook quản lý hàng đợi thông báo Toast tự tắt kèm dọn sạch timer khi unmount | `useToast`, `ToastItem`, `ToastType` | React |
| `src/components/ThemeToggle.tsx` | Công tắc trượt Mặt Trời ↔ Mặt Trăng dùng chung cho `AuthGate` và `LibraryHeader` | `ThemeToggle` | `lucide-react` |
| `src/components/ErrorBoundary.tsx` | React Error Boundary chống trắng trang, có nút tải lại & khôi phục, đồng bộ màu Sáng/Tối | `ErrorBoundary` | `lucide-react` |
| `src/components/ToastContainer.tsx` | Hiển thị stack thông báo không chặn UI góc dưới-phải, đồng bộ màu Sáng/Tối | `ToastContainer` | `lucide-react`, `src/hooks/useToast.ts` |
| `src/components/AuthGate.tsx` | Màn hình kiểm tra kết nối Worker, đăng nhập 1 passcode (D-003), báo lỗi thiếu `VITE_API_URL` (D-005), hỗ trợ đổi Sáng/Tối | `AuthGate` | `lucide-react`, `src/lib/api.ts` |
| `src/components/BookCard.tsx` | Thẻ sách 2D (dọc/ngang): bìa tỉ lệ `3/4` (ảnh lazy qua `IntersectionObserver` + `useCoverUrl` hoặc bìa vải cổ điển fallback), thanh tiến độ %, badge định dạng, chế độ chọn nhiều | `BookCard` | `lucide-react`, `src/types.ts`, `src/hooks/useCoverUrl.ts` |
| `src/components/LibraryHeader.tsx` | Header thương hiệu **Ofu's Library**: thanh dung lượng `usedBytes / limitBytes` (`formatBytes`), chuyển Sáng/Tối, upload, chọn nhiều, làm mới, đăng xuất | `LibraryHeader` | `lucide-react`, `src/types.ts`, `src/lib/api.ts` |
| `src/components/Library2DView.tsx` | Giao diện thư viện 2D: khối "Tiếp tục đọc" theo `progress.updatedAt`, tìm kiếm tên/tác giả/kệ (hỗ trợ không dấu), lọc kệ, thanh chọn hàng loạt, danh sách kệ từ `groupBooksIntoShelves()` | `Library2DView` | `lucide-react`, `src/types.ts`, `src/lib/api.ts`, `src/components/BookCard.tsx`, `src/components/LibraryHeader.tsx` |
| `src/components/PdfReader.tsx` | Trình xem PDF canvas HiDPI, thanh thumbnail (tối đa 40 trang đầu), huỷ `RenderTask` cũ, zoom & tải xuống | `PdfReader` | `pdfjs-dist`, `lucide-react`, `src/lib/parsers.ts` |
| `src/components/ReaderView.tsx` | Trình đọc EPUB/MOBI/CBZ/PDF: mục lục, cài đặt theme/font/cỡ chữ/giãn dòng/độ rộng, lưu & khôi phục vị trí cuộn theo tỉ lệ, phím `←`/`→` an toàn | `ReaderView` | `lucide-react`, `src/types.ts`, `src/components/PdfReader.tsx` |
| `src/App.tsx` | Vỏ điều phối mỏng (~120 dòng): quản lý theme Sáng/Tối, auth state, xử lý `401` tập trung, tải thư viện, nối `AuthGate` / `Library2DView` / `ToastContainer` | `default App` | `src/types.ts`, `src/lib/api.ts`, `src/components/AuthGate.tsx`, `src/components/Library2DView.tsx`, `src/components/ToastContainer.tsx`, `src/hooks/useTheme.ts`, `src/hooks/useToast.ts` |
| `src/main.tsx` | Điểm khởi chạy React, bọc `<ErrorBoundary>` quanh `<App />` | — | `src/components/ErrorBoundary.tsx`, `src/App.tsx` |
| `workers/r2-storage/src/auth.ts` | Xác thực fail-closed cho Worker: so sánh timing-safe, ký & kiểm tra token HMAC-SHA256 30 ngày, `HttpError` | `HttpError`, `AuthEnv`, `isInsecureDevAuthDisabled`, `isAuthRequired`, `timingSafeEqual`, `signPayload`, `createAuthToken`, `authenticatePasscode`, `verifyAuth` | Web Crypto API (`crypto.subtle`) |
| `workers/r2-storage/src/index.ts` | Cloudflare Worker API: CORS, kiểm soát hạn mức 9.0 GiB, CRUD D1, stream upload/download R2 (hỗ trợ HTTP Range) | `default { fetch }` | Cloudflare Workers Runtime (`D1Database`, `R2Bucket`), `workers/r2-storage/src/auth.ts` |

## 3. API của Cloudflare Worker

> Auth `Có*`: bắt buộc `Authorization: Bearer <token>` (hoặc query `?token=`). Mặc định **fail-closed**: thiếu `ACCESS_PASSCODE` sẽ trả `503` (chỉ tắt auth khi chạy dev và đặt tường minh `ALLOW_INSECURE_DEV_NO_AUTH="true"` cùng với việc bỏ trống `ACCESS_PASSCODE`).

| Method | Path | Auth? | Mô tả |
|---|---|---|---|
| `OPTIONS` | `*` | Không | CORS preflight theo `APP_ORIGINS` (trả `204`) |
| `GET` | `/api/health` | Không | Kiểm tra sống, trả `{ ok, authRequired, limitBytes }` |
| `POST` | `/api/auth/login` | Không | Kiểm tra `passcode` (so sánh timing-safe), cấp token HMAC-SHA256 hạn 30 ngày |
| `GET` | `/api/storage` | Có* | Trả thống kê dung lượng `{ usedBytes, limitBytes, remainingBytes, bookCount }` |
| `GET` | `/api/books` | Có* | Trả toàn bộ `books`, bản đồ `progress` và `storage` |
| `PUT` | `/api/books/:id/file` | Có* | Stream file sách (tối đa 350 MB) lên R2, kiểm tra hạn mức 9.0 GiB trước & sau khi ghi, tạo bản ghi D1 |
| `PUT` | `/api/books/:id/cover` | Có* | Stream ảnh bìa JPEG (< 5 MB) lên R2, xoá ảnh bìa cũ trên R2, cập nhật D1 |
| `PATCH` | `/api/books/:id` | Có* | Cập nhật metadata sách (`title`, `author`, `shelf`, `description`, `cover_color`) |
| `DELETE` | `/api/books/:id` | Có* | Xoá 1 sách: xoá object file + cover trên R2 và xoá dòng ở `reading_progress`, `books` |
| `POST` | `/api/books/bulk-delete` | Có* | Xoá hàng loạt sách theo `ids` trên cả R2 và D1 |
| `POST` | `/api/shelves/rename` | Có* | Đổi tên kệ hàng loạt (`oldName` → `newName`) |
| `PUT` | `/api/progress/:bookId` | Có* | Upsert tiến độ đọc (`chapterId`, `chapterIndex`, `scrollRatio`, `scrollTop`, `completed`, `updatedAt`) |
| `DELETE` | `/api/progress/:bookId` | Có* | Xoá tiến độ đọc của 1 sách |
| `GET` / `HEAD` | `/api/files/:key` | Có* | Stream object `books/*` hoặc `covers/*` từ R2; hỗ trợ `Range` (`206`), `ETag`, `Cache-Control: private, max-age=31536000, immutable` |

## 4. Data Model (`workers/r2-storage/schema.sql`)

- **`books`**:
  - `id TEXT PRIMARY KEY`
  - `title TEXT NOT NULL`, `author TEXT NOT NULL DEFAULT 'Không rõ tác giả'`, `shelf TEXT NOT NULL DEFAULT 'Kho chưa phân loại'`, `description TEXT`
  - `cover_color TEXT NOT NULL DEFAULT '#4f46e5'`, `cover_key TEXT`, `file_key TEXT NOT NULL`
  - `file_type TEXT NOT NULL CHECK (file_type IN ('epub', 'mobi', 'pdf', 'cbz'))`
  - `file_size INTEGER NOT NULL DEFAULT 0`, `cover_size INTEGER NOT NULL DEFAULT 0`, `created_at TEXT NOT NULL`
- **`reading_progress`**:
  - `book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE`
  - `chapter_id TEXT NOT NULL`, `chapter_index INTEGER NOT NULL DEFAULT 0`
  - `scroll_ratio REAL NOT NULL DEFAULT 0`, `scroll_top REAL NOT NULL DEFAULT 0`
  - `completed INTEGER NOT NULL DEFAULT 0`, `updated_at INTEGER NOT NULL`
- **Indexes**: `idx_books_shelf`, `idx_books_created_at`, `idx_progress_updated_at`.

## 5. Biến môi trường & cấu hình

| Biến / Binding | Phía | Loại | Đặt ở đâu | Vai trò |
|---|---|---|---|---|
| `VITE_API_URL` | Frontend | Env var (public) | `.env.local` (dev), GitHub Actions Secret (deploy) | URL Cloudflare Worker. Khi trống: chỉ cho phép Local-First ở `DEV`; bản production báo lỗi cấu hình rõ ràng (D-005). |
| `VITE_BASE_PATH` | Frontend | Env var (public) | `.github/workflows/deploy.yml` (`/`) | Base path của Vite build cho domain `ofu.lol`. |
| `APP_ORIGINS` | Worker | Var | `workers/r2-storage/wrangler.toml` `[vars]` | Danh sách origin được phép CORS (`https://ofu.lol`, `http://localhost:5173`, `http://127.0.0.1:5173`). |
| `STORAGE_LIMIT_BYTES` | Worker | Var | `workers/r2-storage/wrangler.toml` `[vars]` | Chốt chặn cứng `9663676416` (9.0 GiB). |
| `BOOKS_BUCKET` | Worker | R2 Binding | `workers/r2-storage/wrangler.toml` | Bucket R2 `arcane-library-books`. |
| `DB` | Worker | D1 Binding | `workers/r2-storage/wrangler.toml` | D1 database `library-db` (`1718c115-0bad-4fd2-b1eb-43a2b63b4ce9`, region APAC). |
| `ACCESS_PASSCODE` | Worker | Secret | `wrangler secret put` (prod) / `.dev.vars` (local) | Mật mã đăng nhập thư viện (thiếu sẽ trả `503` fail-closed). |
| `AUTH_SECRET` | Worker | Secret | `wrangler secret put` (prod) / `.dev.vars` (local) | Khoá ký HMAC-SHA256 cho session token 30 ngày (nếu thiếu chỉ fallback về `ACCESS_PASSCODE`, không dùng chuỗi cố định). |
| `ALLOW_INSECURE_DEV_NO_AUTH` | Worker | Var (tuỳ chọn dev) | `.dev.vars` (chỉ local dev) | Đặt `"true"` (và không đặt `ACCESS_PASSCODE`) để tắt auth khi dev local; tuyệt đối không đặt trên production. |

## 6. Công cụ đã có — cấm viết lại

| Hàm / Hằng | File | Mô tả |
|---|---|---|
| `formatBytes(bytes)` | `src/lib/api.ts` | Định dạng dung lượng byte sang `B / KB / MB / GB / TB`. |
| `sortBooksByTitle(books)` | `src/lib/api.ts` | Sắp xếp danh sách sách theo tiêu đề tiếng Việt (`numeric: true`). |
| `groupBooksIntoShelves(books)` | `src/lib/api.ts` | Gom sách thành các `ShelfGroup` theo tên kệ (không phân biệt hoa thường tiếng Việt). |
| `getAuthToken()` / `setAuthToken()` / `isAuthError()` | `src/lib/api.ts` | Quản lý token đăng nhập và nhận diện lỗi `401`. |
| `checkHealth()` / `loginWithPasscode()` | `src/lib/api.ts` | Kiểm tra Worker & đăng nhập passcode. |
| `fetchLibraryState()` / `uploadBook()` / `updateBookMetadata()` / `updateBookCover()` / `renameShelfAll()` / `deleteBooks()` | `src/lib/api.ts` | Toàn bộ thao tác thư viện (tự động xử lý cache IndexedDB & hạn mức 9.0 GiB). |
| `fetchBookBlobCached()` / `fetchCoverBlobCached()` | `src/lib/api.ts` | Tải sách/ảnh bìa ưu tiên IndexedDB (0ms), cache tự động khi tải từ R2. |
| `saveReadingProgress()` / `clearReadingProgress()` | `src/lib/api.ts` | Lưu/xoá tiến độ đọc đồng thời local và D1. |
| `pickCoverColor(seed)` | `src/lib/parsers.ts` | Chọn màu bìa mặc định ổn định từ bảng màu Arcane theo chuỗi seed. |
| `inferShelfName(title, author)` | `src/lib/parsers.ts` | Suy luận tên kệ từ tác giả hoặc tên bộ truyện (bỏ số tập/chương). |
| `parseFileMetadata(fileName)` | `src/lib/parsers.ts` | Tách `title`, `author`, `shelf`, `extension` từ tên file. |
| `bookDuplicateKey(title, author)` | `src/lib/parsers.ts` | Tạo khoá chuẩn hoá để phát hiện sách trùng lặp. |
| `compressCoverBlob(source)` | `src/lib/parsers.ts` | Crop tâm & nén ảnh bìa về JPEG `480×720` (~40 KB). |
| `extractCoverAtUpload(file, fileType)` | `src/lib/parsers.ts` | Trích xuất ảnh bìa nhẹ 1 lần duy nhất lúc upload cho EPUB/CBZ/MOBI/PDF. |
| `parseBookBlob(blob, book)` | `src/lib/parsers.ts` | Parse EPUB/PDF/CBZ/MOBI thành `ParsedBook` kèm `dispose()` thu hồi Object URL. |
| `getCachedBookBlob` / `setCachedBookBlob` / `deleteCachedBookBlob` | `src/lib/cache.ts` | Đọc/ghi/xoá blob sách trong IndexedDB. |
| `getCachedCoverBlob` / `setCachedCoverBlob` / `deleteCachedCoverBlob` | `src/lib/cache.ts` | Đọc/ghi/xoá blob ảnh bìa trong IndexedDB. |
| `useTheme()` | `src/hooks/useTheme.ts` | Quản lý & chuyển đổi chế độ Sáng (giấy ấm) / Tối (thư viện đêm) lưu `localStorage`. |
| `useCoverUrl(coverKey, enabled?)` | `src/hooks/useCoverUrl.ts` | Tải blob ảnh bìa từ cache/R2 và tự động `URL.revokeObjectURL` khi đổi khoá hoặc unmount. |

## 7. Trạng thái hiện tại

- **Sub-phase 3.2 đã hoàn tất**: giao diện thư viện 2D (`Library2DView`, `LibraryHeader`, `BookCard`, `useCoverUrl`) và hệ màu Sáng/Tối chuẩn **Ofu's Library** (giấy ấm `#f6f1e7` / thư viện đêm `#131110` qua CSS variables + Tailwind tokens) đã nối vào `App.tsx`, build frontend xanh. Upload/modal quản lý sách và nối `ReaderView` tiếp tục ở Sub-phase 3.3 → 3.4.
- **Cảnh báo ESLint `max-lines` còn lại (tách ở 3.4)**:
  - `src/components/ReaderView.tsx`: 673 dòng hiệu dụng (vượt ngưỡng 500).
  - Toàn bộ các module còn lại (`workers/r2-storage/src/*`, `src/App.tsx`, `src/lib/*`, `src/hooks/*`, `src/components/{AuthGate,BookCard,ErrorBoundary,Library2DView,LibraryHeader,PdfReader,ToastContainer}.tsx`, `src/types.ts`): đã đạt chuẩn ≤ 500 dòng.
