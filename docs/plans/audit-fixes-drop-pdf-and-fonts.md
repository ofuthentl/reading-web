# Kế hoạch: Vá lỗi tồn đọng toàn hệ thống, Bỏ PDF & Nâng cấp Font tiếng Việt + 4 chế độ nền

- **Nhánh làm việc:** `fix/audit-bugs-drop-pdf-and-fonts` (tách từ `feat/shelf-tags-and-author-filter`; có thể merge ngay sau khi PR `feat/shelf-tags-and-author-filter` vào `main`).
- **Phạm vi:** Backend Worker (`workers/r2-storage/`), Frontend (`src/`), tài nguyên tĩnh (`public/fonts/`, xoá `public/pdfjs-wasm/`), và tài liệu (`docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `HANDOFF.md`).
- **Nguyên tắc bất biến:** Giữ `index-*.js <= 86.04 kB` gzip (`D-013`), **0 CDN** (`D-010`), chi phí **\$0** Cloudflare Free Tier (`D-002`), mỗi file `<= 500` dòng hiệu dụng (`AGENTS.md` §5), bảo toàn 100% lớp chống crawl `D-028`.

---

## 0. Các quyết định kiến trúc cần chốt trước khi code (`AGENTS.md` §4)

### QĐ-1: Bỏ hoàn toàn định dạng PDF (`D-033`, cập nhật `D-009`)
- **Đã chốt bởi người dùng:** Gỡ bỏ hoàn toàn PDF (`pdfjs-dist`, `PdfReader`, `public/pdfjs-wasm/`, chỉ còn 2 định dạng `epub` và `docx`).
- **Cách xử lý D1 production (chọn phương án an toàn không mất dữ liệu):**
  - **Phương án P1 (Khuyến nghị):** Worker chặn upload/phục vụ `pdf` (`ACCEPTED_FILE_TYPES = new Set(['epub', 'docx'])`); chạy migration `0008_drop_pdf.sql` **chỉ xoá bản ghi `DELETE FROM books WHERE file_type = 'pdf'`** (kèm lưu ý dọn file `.pdf` trên R2 trước nếu đang có) mà **không `DROP TABLE books`** để tránh kích hoạt `ON DELETE CASCADE` ngoài ý muốn lên 4 bảng con (`reading_progress`, `guest_reading_progress`, `book_guest_packs`, `book_bookmarks`); đồng thời cập nhật `CHECK (file_type IN ('epub', 'docx'))` trong `schema.sql` cho DB tạo mới.
  - **Phương án P2 (Loại):** `DROP TABLE books` và backup/restore cả 5 bảng — công sức cao và rủi ro mất toàn bộ tiến độ/dấu trang của EPUB/DOCX nếu lỗi giữa chừng trên D1.

### QĐ-2: 4 chế độ nền (`Ban ngày` – `Giữa trưa` – `Chiều tối` – `Đêm khuya`) — Sửa lỗi B1
Hiện tại **App** đang có 3 chế độ (`light`/`dim`/`midnight`), còn **Trình đọc** vốn đã có sẵn 4 chế độ (`sepia`/`paper`/`dark`/`midnight`), nhưng `useBookReader.ts` đang ghi đè nền đọc về 3 chế độ App mỗi lần mở sách khiến nền thứ 4 không bao giờ lưu được.

| Phương án | Mô tả | Rủi ro / Công sức | Điểm yếu |
|---|---|---|---|
| **1A (Khuyến nghị)** | Giữ App ngoài 3 chế độ (`Ban ngày` / `Chiều tối` / `Đêm khuya`, bảo toàn nguyên 12 tổ hợp 4 Biome × 3 Theme của 3D). Trong **Trình đọc** giữ đủ **4 chế độ** với nhãn **`Ban ngày`** (`#f4ecd8` giấy kem dịu) · **`Giữa trưa`** (`#fcfbf8` giấy trắng sáng) · **`Chiều tối`** (`#0d1117`) · **`Đêm khuya`** (`#060608`). Sửa `useBookReader.ts` **luôn giữ bền màu đọc người dùng chọn** (không ghi đè lúc mở sách/F5; chỉ đồng bộ khi bấm nút đổi theme App ở ngoài). | Rất thấp / Nhỏ (~15 dòng, 3 file). Hoàn tác tức thì. | Ngoài màn hình thư viện vẫn là 3 mức, không có riêng nền trắng tinh `#fcfbf8` ngoài kệ. |
| **1B** | Mở rộng **cả App lẫn Trình đọc** thành 4 chế độ: `Ban ngày` (`#f6f1e7` kem ấm) → `Giữa trưa` (`#fcfbf8` trắng sáng) → `Chiều tối` (`#0d1117`) → `Đêm khuya` (`#060608`), ánh xạ 1-1 với trình đọc và map `noon` → `light` (nắng sáng hơn nhẹ) trong 3D. | Trung bình / Vừa (~10 file: `useTheme`, `ThemeToggle`, `index.html`, `index.css`, `readerConfig`, 3D palette). | Bấm `ThemeToggle` mất 4 nhịp để xoay hết vòng; 2 tông sáng `#f6f1e7` và `#fcfbf8` ngoài trang kệ khá sát nhau. |

### QĐ-3: Font chữ tiếng Việt chuẩn dấu (`0 CDN`, đồng bộ DOM + Guest Canvas)
- **Nguyên nhân lỗi dấu hiện tại:** `Iowan Old Style`, `Palatino Linotype`, `Book Antiqua`, `Georgia` (trong `tailwind.config.js`, `src/index.css`, `guestCanvasLayout.ts`) thiếu glyph dấu tầng kép tiếng Việt (`ệ`, `ữ`, `ở`, `ắ`, `ồ`, `ỷ`…) trên nhiều máy Windows/iOS/macOS, làm trình duyệt ghép font dự phòng giữa chừng gây chữ to/nhỏ lệch dòng & dính dấu; thêm vào đó EPUB mã hoá NFD chưa được chuẩn hoá NFC.

| Phương án | Mô tả | Rủi ro / Công sức | Điểm yếu |
|---|---|---|---|
| **F1 (Khuyến nghị)** | Đóng gói cục bộ **0 CDN** 3 font open-source chuẩn tiếng Việt (SIL OFL, chỉ subset `latin` + `latin-ext` + `vietnamese`, định dạng `.woff2` nhẹ ~18–35 KB/file trong `public/fonts/`, **`0 B` tăng vào `index-*.js`**): <br>1. **Văn học (`serif` + `font-display`):** `Literata` (400 / 400i / 600 / 700 — font của Google Play Books, dấu kép tiếng Việt sắc nét số 1 cho đọc dài).<br>2. **Hiện đại (`sans`):** `Be Vietnam Pro` (400 / 400i / 600 / 700 — thiết kế gốc bởi typographer Việt Nam).<br>3. **Mono (`mono`):** `JetBrains Mono` (400 / 700 — chuẩn bảng trạng thái game Isekai/SAO).<br>Kèm chuẩn hoá `.normalize('NFC')` khi parse EPUB/DOCX và đợi `document.fonts` vẽ lại Canvas khách. | Thấp / Vừa (~260–340 KB `.woff2` tĩnh trên GitHub Pages, `0 B` R2). Hoàn tác bằng xoá `public/fonts/` + khôi phục CSS. | Lần đầu mở sách trên thiết bị mới có thể chuyển font trong ~50–150ms (`font-display: swap`), lần sau từ cache `0ms`. |
| **F2** | Chỉ đổi System Font Stack (`Cambria, "Times New Roman", serif` + `"Segoe UI", Roboto, sans-serif`), không nhúng font. | Rất thấp / Rất nhỏ. | Kém thẩm mỹ khi đọc Light Novel dài và không đồng nhất giữa Windows / iOS / Android. |
| **F3 (Loại)** | Nạp Google Fonts CDN qua `<link>`. | Vi phạm `D-010` (**0 CDN**). | Chậm/lỗi khi mạng yếu hoặc đọc cache offline. |

---

## 1. Chia Phase triển khai

### Phase 1 — Bỏ hoàn toàn PDF (`D-033`) & Gỡ `@react-three/drei` thừa
- **Mục tiêu:** Loại bỏ triệt để mã nguồn, dependency và WASM của PDF (giảm ~2.67 MB tài sản build), đồng thời gỡ `@react-three/drei` không dùng.
- **Tệp xoá:**
  - `src/components/PdfReader.tsx`, `src/components/PdfReaderFallback.tsx`, `src/lib/pdfjsLoader.ts`, `public/pdfjs-wasm/*`.
- **Tệp sửa (Frontend):**
  - `package.json`: gỡ `pdfjs-dist` và `@react-three/drei` + chạy `npm install`.
  - `src/types.ts`: `BookFileType = 'epub' | 'docx'`; bỏ `pdf_page_number`, `pdfBlobUrl`.
  - `src/lib/parsers.ts`, `src/lib/bookMetadata.ts`, `src/lib/api.ts`, `src/lib/libraryFiltering.ts`, `src/lib/nextVolume.ts`, `src/lib/readingStats.ts`.
  - `src/hooks/useBookReader.ts`, `src/hooks/useReaderController.ts`.
  - `src/components/ReaderView.tsx`, `src/components/ReaderTopBar.tsx`, `src/components/ReaderTocDrawer.tsx`, `src/components/ReaderSearchAndBookmarks.tsx`, `src/components/GuestCanvasReader.tsx`, `src/components/UploadDropzone.tsx`, `src/components/BookCard.tsx`, `src/components/Library2DView.tsx`, `src/components/ReadingStatsModal.tsx`, `src/components/library3d/{BookInspectCard,bookPacking3d,Library3DOverlay}.tsx`, `public/manifest.webmanifest`.
- **Tệp sửa (Backend Worker):**
  - `workers/r2-storage/src/booksDb.ts`, `workers/r2-storage/src/index.ts`, `workers/r2-storage/src/r2Files.ts`, `workers/r2-storage/schema.sql`.
  - Tạo `workers/r2-storage/migrations/0008_drop_pdf.sql` (xoá bản ghi `file_type = 'pdf'`, giữ nguyên bảng `books` không `DROP TABLE` tránh rủi ro CASCADE).
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Nếu trên kho production đang có file `.pdf` cũ, chạy SQL trước khi xoá qua UI sẽ để sót file `.pdf` trên R2. **Biện pháp:** Trước khi chạy migration trên remote, kiểm tra nếu còn sách PDF trên `ofu.lol` thì xoá bằng nút Xoá trong giao diện Admin để sạch cả R2 lẫn D1.
  - *Hoàn tác:* `git revert <commit-phase-1>` và `npm install`.

---

### Phase 2 — Vá Bảo mật, Toàn vẹn dữ liệu & Hiệu năng Backend Worker
- **Mục tiêu:** Đóng toàn bộ lỗi 🔴 và 🟠 của Cloudflare Worker (`H-1` → `H-5`, `M-1` → `M-9`, `L-1` → `L-5`).
- **Các hạng mục chính:**
  1. **Chống bypass Token Bucket song song (`H-1`):** Chuyển `consumeGuestChapterToken` (`guestPack.ts`) và `consumeGuestSearchQuota` (`guestSearch.ts`) sang `UPDATE` nguyên tử tính refill trực tiếp trong SQL + tăng `rl_strikes = rl_strikes + 1` nguyên tử; tự đóng phiên khi chạm ngưỡng strike.
  2. **Sửa Forensic Watermark (`H-3` + `L-3`):**
     - Chuẩn hoá `.normalize('NFC')` trước khi khớp `SLOT_REGEX` ở `watermarkTextString` và `watermarkSpans`.
     - Trong `extractForensicObservations`, tách văn bản dán vào theo từng đoạn (`/\r?\n+/`) để `beforeKey`/`afterKey` khớp 100% lúc nhúng.
     - Import HMAC `CryptoKey` 1 lần ngoài vòng lặp ứng viên.
  3. **Chống Replay Attack Discord Webhook (`H-4`):** Kiểm tra `X-Signature-Timestamp` là Unix seconds hợp lệ và chênh lệch `<= 300` giây so với `Date.now()` trong `discord.ts`.
  4. **Chống Fail-Open khi đổi tên kệ (`H-5`):** Trong `booksDb.ts` (`renameShelfCaseInsensitive`), tạo/hợp nhất quy tắc `restricted` và `shelf_guest_grants` sang `newKey` **trước** khi chạy `UPDATE books`, không dùng `.catch(() => undefined)` cho bước bảo mật, chỉ xoá `oldKey` sau khi xong.
  5. **Bảo vệ CPU 10ms của `guestSearch` (`H-2`):** Chuyển bước trừ quota xuống **sau** khi xác nhận có `book_guest_packs`, bổ sung header `Retry-After` cho `429`, giới hạn ngân sách byte/chương giải nén an toàn (trả kèm cờ `truncated` nếu sách quá dài), dùng chuỗi ASCII viết thường nhẹ thay cho `.toLocaleLowerCase('vi')` lặp lại.
  6. **Validate chặt `PUT /api/progress/:bookId` (`M-1`):** Kiểm tra `typeof chapterId === 'string'` (`<= 120` ký tự), kẹp `chapterIndex >= 0`, `scrollRatio ∈ [0, 1]`, `scrollTop >= 0`, dùng `Date.now()` phía server cho `updated_at` chống đầu độc `weeklyPopular`.
  7. **Siết Auth & Chống brute-force (`M-2`, `M-3`, `M-8`, `L-1`):**
     - Luôn băm `ua-v1:${userAgent.trim()}` kể cả khi UA rỗng (không lưu `NULL` để bỏ qua check).
     - Gỡ bỏ fallback `?token=` trong URL query string ở `verifyAuth`.
     - Bỏ `.catch(() => null)` trong `verifyAuth` (lỗi D1 tạm thời trả `503` thay vì `401` đá văng phiên guest).
     - Bổ sung bảng/cơ chế throttle nhẹ chống thử sai `POST /api/auth/login` liên tục theo IP (`CF-Connecting-IP`) + hướng dẫn đặt thêm Cloudflare WAF Rate Limiting rule.
  8. **An toàn ghi/xoá R2 + D1 (`M-4`, `M-5`, `M-6`, `M-7`, `L-4`, `L-5`):**
     - `deleteSingleBook` / `bulkDeleteBooks`: gọi `ensureShelfTagsSchema`, đọc `pack_key` thực từ `book_guest_packs`, xoá D1 trước rồi mới xoá R2 theo chunk `<= 500` key; gộp lệnh dọn dẹp theo batch.
     - `putAdminShelfAccessConfig` (`shelfAccessDb.ts`): đưa `UPSERT rules` + `DELETE grants` + toàn bộ `INSERT OR REPLACE` vào **1 `db.batch()` nguyên tử duy nhất**.
     - `PUT /file` & `PUT /cover`: hậu kiểm `putResult.size <= 0 || putResult.size > MAX_*`, kiểm tra `meta.changes === 1` khi cập nhật bìa (tránh rác R2 nếu sách vừa bị xoá).
     - `uploadBookGuestPack`: kiểm tra `Content-Length` trước khi `arrayBuffer()`, dùng versioned key `guest-packs/${bookId}-${now}.pack` rồi mới xoá `pack_key` cũ sau khi D1 commit.
     - `r2Files.ts`: dùng `BOOKS_BUCKET.head(key)` cho `HEAD`, kẹp chuẩn `Range` và trả `416 Range Not Satisfiable`, phân biệt `412` vs `304`, bổ sung `If-None-Match, If-Modified-Since` vào CORS `Access-Control-Allow-Headers`.
     - Dọn `shelf_prefs.cover_book_id` cũ khi chuyển sách sang kệ khác; cho phép guest xoá tiến độ cũ của chính mình kể cả khi kệ vừa bị khoá; thống nhất dùng `normalizedPath` cho toàn bộ endpoint trong `index.ts`; chỉ gọi `getStorageStats` trong `GET /api/books` khi `auth.role === 'owner'`.
  9. **Hiệu năng D1 (`M-9` + `L-2`):**
     - Thêm `WeakSet<D1Database>` cache cho `ensureGuestProgressTable` (`progressDb.ts`) và `ensureBookmarksTable` (`bookmarksDb.ts`), chỉ `add(db)` sau khi `ALTER` thành công.
     - Gộp 3 query rời trong `assertGuestBookAccess` (`shelfAccessDb.ts`) thành 1 câu `LEFT JOIN`.
     - Tạo `workers/r2-storage/migrations/0009_perf_indexes.sql` thêm index `idx_guest_progress_updated_at`, `idx_guest_progress_book_id`, `idx_bookmarks_book_id` và cập nhật `schema.sql`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Thay đổi logic SQL Token Bucket và `verifyAuth` có thể ảnh hưởng guest đang đọc nếu viết sai câu SQL. **Biện pháp:** Kiểm thử trực tiếp bằng `wrangler dev` local với cả 2 vai trò `owner` & `guest` + bắn 15 request song song xác nhận Token Bucket chặn đúng.
  - *Hoàn tác:* `git revert <commit-phase-2>` + re-deploy Worker bản trước.

---

### Phase 3 — Font tiếng Việt cục bộ (`0 CDN`), Chuẩn hoá NFC / EPUB Link & 4 chế độ nền (`B1`)
- **Mục tiêu:** Chấm dứt hoàn toàn lỗi dấu tiếng Việt trên mọi thiết bị (PC/Mobile, DOM & Guest Canvas), sửa triệt để lỗi lưu màu nền đọc `B1`, sửa lỗi chú thích/ảnh EPUB.
- **Các hạng mục chính:**
  1. **Tự host font `.woff2` subset tiếng Việt (`public/fonts/`):**
     - Trích các tệp `.woff2` (chỉ `latin` + `latin-ext` + `vietnamese`, bỏ Cyrillic/Greek) cho `Literata` (400, 400i, 600, 700), `Be Vietnam Pro` (400, 400i, 600, 700), `JetBrains Mono` (400, 700) vào `public/fonts/`.
     - Khai báo `@font-face` (`font-display: swap`, đường dẫn tương đối theo `BASE_URL`) trong `src/index.css`; cập nhật `tailwind.config.js` (`font-display` dùng `'Literata'`), `.font-reader-serif`, `.font-reader-sans`, `.font-reader-mono` và `FONT_STACK_MAP` trong `src/lib/guestCanvasLayout.ts`.
     - Trong `GuestCanvasReader.tsx` & `GuestCanvasPaginatedView.tsx`: lắng nghe `document.fonts` nạp xong để xoá `widthCache` và tính lại layout/vẽ lại Canvas chuẩn xác; đồng thời sửa lỗi `M-04` (đo và vẽ tiêu đề bằng cùng font `'serif'`/`Literata` thay vì đo bằng `settings.font` rồi vẽ bằng `'serif'`).
  2. **Chuẩn hoá tiếng Việt NFC & khắc phục lỗi EPUB thực tế:**
     - Gọi `.normalize('NFC')` cho HTML/text chương trong `src/lib/parsers.ts` và `src/lib/docxParser.ts` (trị dứt điểm EPUB NFD gãy dấu + khớp luôn với `ReaderSearchPanel`).
     - Thêm tra cứu ảnh fallback không phân biệt hoa/thường trong `getZipImageEntry` (`parsers.ts`) tránh mất ảnh ở EPUB fan-sub.
     - Trong `ReaderView.tsx` & `ReaderPaginatedView.tsx`: xử lý click vào `<a href>` trong nội dung sách — link ngoài mở tab mới (`target="_blank" rel="noopener noreferrer"`), link neo nội bộ (`#id`) cuộn tới phần tử đích trong chương, chặn link tệp `.xhtml` nội bộ làm văng khỏi SPA (tránh lỗi 404 → `/locked`).
  3. **Sửa lỗi B1 & đổi nhãn 4 chế độ nền (`Ban ngày` – `Giữa trưa` – `Chiều tối` – `Đêm khuya`):**
     - Triển khai theo phương án đã chốt (**Cách 1**): App 2D + Trình đọc hỗ trợ đủ 4 chế độ nền (`UiTheme = AppTheme | 'noon'`), **không sửa 1 dòng nào trong `src/components/library3d/`** cho phần theme; tại cầu nối `App.tsx` map `noon → light` cho 3D và dùng `cycle3DTheme` xoay gọn 3 mốc sáng/chiều/đêm trong HUD 3D.
     - Bảo đảm chọn bất kỳ chế độ nền nào trong Trình đọc đều lưu vĩnh viễn qua F5, đóng/mở sách, và "Đọc tiếp Tập kế".
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Đường dẫn `/fonts/*.woff2` cần tương thích `VITE_BASE_PATH` (`/`) và hoạt động khi truy cập từ `/entrance` hoặc `/locked`. **Biện pháp:** Dùng đường dẫn tương thích Vite asset/public và kiểm tra thực tế trên `vite preview` + Network tab (`200 OK`, 0 request CDN ngoài).
  - *Hoàn tác:* `git revert <commit-phase-3>`.

---

### Phase 4 — Vá toàn bộ lỗi Frontend (Auth, Trình đọc, Lightbox, Modal, Mobile & UX)
- **Mục tiêu:** Sửa sạch toàn bộ lỗi Frontend còn lại đã xác minh (`H-01`, `H-02`, `H-04`, `H-05`, `H-06`, `H-09`, `M-01` → `M-10`, `M-12`, `L-01` → `L-06`).
- **Các hạng mục chính:**
  1. **Auth & Vòng đời phiên (`H-01`, `H-02`, `H-06`, `L-06`):**
     - Memoize `handleAuthenticated` bằng `useCallback` trong `src/App.tsx` chống reset form `/entrance`.
     - Trong `src/lib/authSession.ts`: tách rõ `getActiveAuthSession()` — ở Cloud Mode khi không có token hợp lệ trả về phiên an toàn `role: 'guest'` (hoặc `null`) thay vì `DEFAULT_OWNER_SESSION`, tránh lọt guard đọc IndexedDB owner.
     - Gọi `clearStoreOnLogout()` (reset cả `books`, `progress`, `weeklyPopularIds`, `storage`, `shelfPrefs` nhạy cảm và reset bộ lọc/kệ đang mở) trong cả `handleApiError` (401) và `closeExpiredDoor`; hỗ trợ hẹn giờ theo từng chặng (chống bỏ qua `setTimeout > 24.85 ngày` của phiên owner 30 ngày).
     - Truyền `onApiError` xuống `ReaderTocDrawer` → `ReaderSearchPanel` / `ReaderBookmarksPanel` để gặp `401` đá sạch về `/locked`.
  2. **Trình đọc, Lightbox & Guest Stream (`H-04`, `H-09`, `M-05`, `M-09`, `M-10`, `L-04`, `L-05`):**
     - `ReaderImageLightbox.tsx`: thêm `didDragRef` chặn `onClick` đóng modal ngay sau khi kéo pan ảnh; thêm `touch-none`; chuyển `wheel` sang native listener `{ passive: false }`.
     - `useGuestChapterStream.ts`: bổ sung LRU cap (`MAX_RAM_BITMAPS = 24`) đóng `.close()` ảnh của chương xa nhất (bỏ qua ảnh thuộc chương đang mở).
     - `ReaderPaginatedView.tsx` & `GuestCanvasPaginatedView.tsx`: `return` ngay khi đóng Settings popover; tự báo hoàn thành cho chương cuối chỉ có 1 trang (`totalPages === 1`); cleanup `requestAnimationFrame` khi ảnh tải xong.
     - `useReaderController.ts`: không kích hoạt `ArrowLeft`/`ArrowRight` khi nhấn kèm `Alt`/`Ctrl`/`Meta` hoặc khi `tocOpen`/`settingsOpen` đang mở; đồng bộ `completedRef`.
     - `ActiveReaderHost.tsx` & `useBookReader.ts`: nút "Huỷ" chỉ huỷ phiên mở sách mới (`cancelOpeningBook` + `AbortController`), không đóng cuốn đang đọc.
     - `ReaderSettingsPopover.tsx`: thêm `max-h-[calc(100dvh-5rem)] overflow-y-auto` tránh cắt nút trên mobile xoay ngang.
     - `ReaderSearchAndBookmarks.tsx`: chuẩn hoá NFC trước khi tính chỉ số cắt đoạn highlight.
  3. **Kho dữ liệu, Modal quản trị & Lọc khách (`H-05`, `M-01`, `M-02`, `M-03`, `M-06`, `M-07`, `M-08`, `M-12`):**
     - Giữ lại `guest_ready` trong `updateBookMetadata` (`api.ts`), `handleBookUpdated` & `handleBooksBatchUpdated` (`useLibraryDataStore.ts`); thêm `requestId` guard chống race trong `loadLibrary()`.
     - Rollback optimistic state trên `handleMarkBookCompleted`, `handleResetBookProgress`, `setShelfCoverBook`, `setShelfFavorite`, `setShelfTags` khi API thất bại.
     - `libraryFiltering.ts`: bổ sung `!b.guest_locked` vào `prioritizeGuestReadable`; `shelfSummary.ts` & `BookInfoModal.tsx`: bỏ qua tập `guest_ready === false` ở nút mở đọc nhanh cho `guest`.
     - `ShelfTagsModal.tsx`, `ShelfAccessModal.tsx`, `ShelfBatchNoteModal.tsx`: chỉ reset state theo `shelf?.key` (chống `legacyCoverSync` xoá form đang gõ); chặn `Enter` trong `ShelfAccessMemberList.tsx` để gọi `onAddManualId()` thay vì submit form.
     - `AdminProtectionModal.tsx` & `ShelfBatchNoteModal.tsx`: dừng vòng lặp khi gặp `isAuthError` và abort/stop khi unmount.
     - `parsers.ts` & `guestPackBuilder.ts`: truyền `options?.skipMediaBlobs` vào `parseDocxBlob` và truyền trực tiếp `arrayBuffer` tránh nhân đôi RAM đỉnh.
  4. **UX / A11y / CSS nhỏ (`L-01` → `L-06`):**
     - `useCardReveal.ts`: huỷ `pendingTiltRaf` / `pendingTiltJob` trong `handleCoverTiltLeave` tránh kẹt nghiêng 3D.
     - `mikuCursorAnimator.ts`: kiểm tra `currentEl.isConnected`, chỉ xoá cursor nếu đúng giá trị do animator gắn, khôi phục khi quay lại từ bfcache (`pageshow`).
     - `BookCard.tsx`, `ShelfCoverCard.tsx`, `EditorialBookStrip.tsx`: chặn `onKeyDown` khi `event.target !== event.currentTarget` (không mở nhầm sách khi bấm phím vào nút con).
     - Dọn `formatFilter` thừa trong `useLibraryViewState.ts` & văn bản cũ ở `LibraryCatalogView.tsx`, `BookEditModal.tsx`; dùng `getDisplayAuthor` ở `ReaderTocDrawer.tsx`; ẩn nút Khiên bảo vệ mobile ở Local mode; reset `batchNoteOpen`/`tagsModalOpen` khi `openedLibraryShelf` thành `null`; tăng độ tương phản chip 0 cuốn ở `AdvancedSearchPanel.tsx`; clear timer unmount ở `SupportView.tsx` & `WorldQuickBar.tsx`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Chia thành 2 commit nhỏ (4a: Auth + Reader + Lightbox; 4b: Store + Modals + UX) để dễ review và kiểm thử.
  - *Hoàn tác:* `git revert <commit-phase-4a/4b>`.

---

### Phase 5 — Vá lỗi 3D, Cập nhật Tài liệu & Kiểm định tổng thể
- **Mục tiêu:** Sửa các lỗi 3D nhỏ (`M-11`), dọn dead code và đồng bộ tài liệu chuẩn `AGENTS.md` §7-8.
- **Tệp sửa:**
  - `src/components/library3d/gltfLoader.ts`: thêm `cacheGeneration` chống rò VRAM khi rời 3D giữa lúc GLB đang tải.
  - `src/components/library3d/LibraryCanvas.tsx`: xử lý an toàn vòng đời `libraryMaterials`/`worldMaterials` dưới React 18 `<StrictMode>`.
  - `src/components/library3d/FantasyLibrary3D.tsx`: sửa `Escape` đóng `bossSealNotice` (`&& !bossSealNotice`); gỡ prop thừa `onRenameShelf` không dùng.
  - `src/components/library3d/InteractiveStations.tsx`: đổi `document.body.style.cursor = 'auto'` thành `''` giữ con trỏ Miku.
  - `src/components/library3d/layout3d.ts`: gỡ hàm dead code `buildLibraryLayout3D`.
  - `src/components/library3d/KiritoAvatar.tsx`: chỉ khởi tạo texture/material fallback procedural khi `player.glb` chưa sẵn sàng hoặc lỗi, giải phóng khi đã dùng GLB.
  - Cập nhật `docs/DECISIONS.md` (`D-033` bỏ PDF, `D-034` font tiếng Việt cục bộ & 4 chế độ nền), `docs/ARCHITECTURE.md` (cập nhật sơ đồ, bảng module, bỏ PDF, sửa chỗ cũ `coverImage`/`AuthGate`), và `HANDOFF.md`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Thấp, cô lập hoàn toàn trong chunk lazy 3D (`0 B` ảnh hưởng 2D/mobile).
  - *Hoàn tác:* `git revert <commit-phase-5>`.

---

## 2. Checklist kiểm thử bắt buộc trước khi xem là xong (`AGENTS.md` §7)

1. **Build & Static checks:**
   - `npm run typecheck` sạch `0` lỗi.
   - `npm run lint` sạch `0` lỗi / `0` cảnh báo (mọi file `<= 500` dòng hiệu dụng).
   - `npm run build` xanh, kiểm tra `dist/assets/index-*.js <= 86.04 kB` gzip, **0 file `pdf*.js` / `pdfjs-wasm`**, **0 B `three` ở entry**, **0 CDN**.
   - `cd workers/r2-storage && npx tsc --noEmit` sạch `0` lỗi.
2. **Kiểm thử Backend Worker (`wrangler dev`):**
   - Upload `.pdf` trả `400`; upload `.epub`/`.docx` thành công.
   - Bắn 15 request `GET /api/guest/books/:id/chapters/0..14` **song song** bằng tài khoản `guest` → chỉ 10 request đầu qua, 5 request sau trả `429` có `Retry-After` (xác nhận vá xong `H-1`).
   - Nhúng Forensic Watermark trên văn bản tiếng Việt nhiều đoạn (cả NFC & NFD) rồi chạy `/api/admin/forensic-check` → tỉ lệ khớp đạt ~100% (xác nhận vá xong `H-3`).
   - Gửi Discord webhook có `X-Signature-Timestamp` quá hạn > 5 phút → trả `401` (`H-4`).
   - Gửi `PUT /api/progress/:id` với `updatedAt` tương lai xa / `chapterIndex` âm → server kẹp chuẩn về `Date.now()` và `>= 0` (`M-1`).
   - Đổi tên kệ `restricted` → kiểm tra guest không thuộc danh sách vẫn bị `403` liên tục (`H-5`).
3. **Kiểm thử Frontend trên PC (`1280×800`) + Mobile (`390×844` & xoay ngang `844×390`):**
   - `/entrance`: gõ dở mã khoá, bấm đổi theme & chờ Toast tự tắt → form không bị reset/nháy (`H-01`).
   - Chọn lần lượt cả 4 nền đọc (`Ban ngày`, `Giữa trưa`, `Chiều tối`, `Đêm khuya`), F5 và mở tập kế tiếp → giữ nguyên đúng màu đã chọn (`B1`).
   - Đọc thử tiếng Việt nhiều dấu tầng kép (`ệ`, `ữ`, `ở`, `ắ`, `ồ`, `ỷ`, `ư`, `ơ`, nghiêng + đậm) trên cả 3 font (`Văn học` Literata, `Hiện đại` Be Vietnam Pro, `Mono` JetBrains Mono) ở cả **DOM `ReaderView`** lẫn **Canvas `GuestCanvasReader`** (cuộn dọc + lật trang 2 cột) → 0 lỗi dấu, 0 lệch tiêu đề.
   - Mở ảnh minh hoạ trong `ReaderImageLightbox`, phóng to 200%, kéo ảnh qua lại rồi thả chuột → Lightbox giữ nguyên không tự đóng (`H-09`).
   - Sửa tên/mô tả 1 cuốn EPUB đã có guest-pack → badge Khiên bảo mật không báo thiếu giả (`H-05`).
   - Trong `ShelfAccessModal`: nhập Discord ID rồi bấm `Enter` → thêm vào danh sách thay vì submit đóng modal (`M-06`).
   - Mobile xoay ngang: mở `ReaderSettingsPopover` cuộn được trọn vẹn mọi tuỳ chọn (`L-04`); `0` lỗi Console / `0` request ra CDN ngoài.
