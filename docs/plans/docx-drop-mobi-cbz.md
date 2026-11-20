# Kế hoạch Triển khai — Xoá MOBI/CBZ, Thêm hỗ trợ DOCX & Vá lỗi tồn đọng (`feat/docx-drop-mobi-cbz`)

> **Trạng thái:** Đã hoàn tất triển khai Phase 1 → 3, migrate D1 remote, deploy Worker live và vượt qua 100% kiểm thử tự động & thực tế trên trình duyệt — sẵn sàng mở PR vào `main`.
> **Nhánh triển khai:** `feat/docx-drop-mobi-cbz` (tách từ `origin/main` với `--no-track`).
> **Quyết định kiến trúc:** `D-009` trong `docs/DECISIONS.md` (chỉ hỗ trợ 3 định dạng `epub`, `pdf`, `docx`; xoá sạch MOBI/CBZ và gỡ `@lingo-reader/mobi-parser`; parse DOCX reflowable bằng `jszip` + `DOMParser` + `DOMPurify` đã có sẵn).
> **Hiện trạng D1 Production (`library-db`):** Đã kiểm tra thực tế có **49 cuốn `epub`** và **0 cuốn `mobi`/`cbz`**.

---

## 1. Mục tiêu

1. **Loại bỏ hoàn toàn `mobi` và `cbz`, thêm `docx`** trên cả Database D1, Cloudflare Worker và Frontend (`BookFileType = 'epub' | 'pdf' | 'docx'`).
2. **Trình đọc & trích xuất bìa DOCX (`src/lib/docxParser.ts`)**:
   - Tận dụng `jszip` + `DOMParser` + `sanitizeBookDocument` (`DOMPurify`) sẵn có — **không cần cài thêm thư viện ngoài**, đồng thời gỡ bỏ `@lingo-reader/mobi-parser` và vá `npm audit fix` (`cross-spawn`).
   - Hỗ trợ trích xuất ảnh bìa DOCX khi tải lên (`docProps/thumbnail.*` hoặc ảnh đầu tiên trong `word/media/*`).
   - Giải mã `word/document.xml` + `word/_rels/document.xml.rels`: giữ nguyên đoạn văn, định dạng chữ đậm/nghiêng/gạch chân, danh sách, bảng biểu, hình ảnh nhúng (`blob:` URL được thu hồi đầy đủ trong `dispose()`), và tự động tách chương theo `Heading 1`/`Heading 2` hoặc tiêu đề dạng `Chương X` / `Phần X`.
3. **Vá đồng bộ các lỗi tồn đọng từ đợt review code**:
   - Chống ghi đè & xoá nhầm file R2 khi `PUT /api/books/:id/file` bị gửi trùng `bookId`.
   - Đổi tên kệ (`POST /api/shelves/rename`, `renameShelfAll`, `App.tsx`) khớp không phân biệt hoa/thường tiếng Việt đồng nhất với `groupBooksIntoShelves()`.
   - Khi thay ảnh bìa (`PUT /api/books/:id/cover`), cập nhật D1 thành công rồi mới xoá ảnh bìa cũ trên R2.
   - Kiểm tra kiểu dữ liệu và giới hạn độ dài an toàn khi `PATCH /api/books/:id`.
   - Kiểm tra `res.ok` trong `saveReadingProgress()` và chỉ xoá cache IndexedDB trong `deleteBooks()` sau khi xoá thành công.

---

## 2. Các Phase triển khai

### Phase 1 — Migration D1, cập nhật Cloudflare Worker & vá lỗi Backend
- **Thay đổi:**
  - Cập nhật `workers/r2-storage/schema.sql` và tạo `workers/r2-storage/migrations/0001_docx_drop_mobi_cbz.sql`:
    - Xoá mọi dòng `reading_progress` và `books` có `file_type IN ('mobi', 'cbz')` (nếu có).
    - Tạo lại bảng `books` với `CHECK (file_type IN ('epub', 'pdf', 'docx'))`, giữ nguyên toàn bộ 49 cuốn EPUB hiện có trên D1.
  - Cập nhật `workers/r2-storage/src/booksDb.ts`:
    - `BookRow['file_type'] = 'epub' | 'pdf' | 'docx'`.
    - `ACCEPTED_FILE_TYPES = new Set(['epub', 'pdf', 'docx'])`.
    - `CONTENT_TYPES`: thêm `docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'`, bỏ `mobi` và `cbz`.
  - Cập nhật `workers/r2-storage/src/index.ts`:
    - Thông báo lỗi định dạng: `'Chỉ hỗ trợ định dạng EPUB, PDF hoặc DOCX.'`.
    - Trong `PUT /api/books/:id/file`: kiểm tra `SELECT id FROM books WHERE id = ?` trước khi ghi lên R2; nếu đã tồn tại trả `409 Conflict` để không bao giờ xoá nhầm file R2 của sách cũ.
    - Trong `PUT /api/books/:id/cover`: chạy `UPDATE books SET cover_key = ?, cover_size = ? WHERE id = ?` trước, sau đó mới xoá `existing.cover_key` trên R2.
    - Trong `PATCH /api/books/:id`: kiểm tra `description === null || typeof description === 'string'`, giới hạn độ dài `title`/`author` (`<= 300`) và `description` (`<= 5000`).
    - Trong `POST /api/shelves/rename`: đổi tên kệ khớp không phân biệt hoa/thường tiếng Việt bằng cách đối chiếu danh sách kệ trong D1.
- **Rủi ro & Hoàn tác:**
  - Migration tạo lại bảng `books` có thể làm kích hoạt `ON DELETE CASCADE` ở `reading_progress` nếu không giữ hoặc sao chép lại. Khắc phục: sao lưu `reading_progress` sang bảng tạm trong cùng batch SQL rồi khôi phục lại ngay sau khi đổi bảng `books`.
  - Hoàn tác: `git revert` commit Phase 1 và chạy migration đảo ngược constraint.

### Phase 2 — Gỡ `@lingo-reader/mobi-parser`, viết `src/lib/docxParser.ts` & cập nhật `src/lib/parsers.ts`
- **Thay đổi:**
  - Gỡ `@lingo-reader/mobi-parser` khỏi `package.json` và chạy `npm audit fix` để xử lý cảnh báo `cross-spawn`.
  - Tạo `src/lib/docxParser.ts` (~220 dòng):
    - `extractDocxCover(zip)`: tìm `docProps/thumbnail.*` hoặc ảnh đầu tiên trong `word/media/*` rồi nén qua `compressCoverBlob`.
    - `parseDocxBlob(blob, book, loadJSZip)`: đọc `word/document.xml` và `word/_rels/document.xml.rels`, tạo `blob:` URL cho ảnh nhúng (lưu vào `createdUrls` để `dispose()` thu hồi 100%), dựng HTML sạch qua `sanitizeBookDocument`, chia chương thông minh theo `Heading 1`/`Heading 2` hoặc tiêu đề chương.
  - Cập nhật `src/lib/parsers.ts`:
    - Xoá toàn bộ `loadMobiParser`, `parseMobiBlob`, `parseCbzBlob`, `protectSameOriginBlobImages`, `restoreSameOriginBlobImages` và nhánh `mobi`/`cbz` trong `extractCoverAtUpload`.
    - Nối `fileType === 'docx'` vào `extractCoverAtUpload` và `parseBookBlob`.
- **Rủi ro & Hoàn tác:**
  - File DOCX không có Heading nào: tự động gom hoặc chia thành các phần hợp lý để đọc mượt không bị quá dài trên 1 trang cuộn.
  - Hoàn tác: `git revert` commit Phase 2.

### Phase 3 — Cập nhật Frontend (`types`, `bookMetadata`, `api`, UI components) & tài liệu
- **Thay đổi:**
  - `src/types.ts`: `export type BookFileType = 'epub' | 'pdf' | 'docx';`
  - `src/lib/bookMetadata.ts`: regex nhận diện đuôi `.epub|.pdf|.docx`.
  - `src/lib/api.ts`:
    - Cập nhật thông báo chỉ hỗ trợ `EPUB, PDF hoặc DOCX`.
    - `renameShelfAll`: khớp không phân biệt hoa/thường tiếng Việt (`toLocaleLowerCase('vi')`) ở chế độ Local-First.
    - `deleteBooks`: xoá trên Worker/D1 thành công rồi mới xoá blob trong IndexedDB.
    - `saveReadingProgress`: kiểm tra `!res.ok` và ném lỗi để `useBookReader` xử lý nhất quán.
  - `src/App.tsx`: `handleShelfRenamed` và `renamingShelfCount` so khớp tên kệ không phân biệt hoa/thường tiếng Việt.
  - `src/components/UploadDropzone.tsx`, `src/components/Library2DView.tsx`, `src/components/ReaderView.tsx`: cập nhật `ACCEPTED_EXTENSIONS = '.epub,.pdf,.docx'`, nhãn hướng dẫn `EPUB, PDF, DOCX`, và bỏ nhánh hiển thị `cbz` trong `ReaderView`.
  - Cập nhật `docs/ARCHITECTURE.md` và `HANDOFF.md`.
- **Rủi ro & Hoàn tác:**
  - Hoàn tác: `git revert` commit Phase 3.

---

## 3. Checklist kiểm thử

- [x] `npm run typecheck`, `npm run lint`, `npm run build` và `cd workers/r2-storage && npx tsc --noEmit` đều **0 lỗi, 0 cảnh báo**.
- [x] `npm audit --omit=dev` sạch lỗ hổng (`found 0 vulnerabilities`).
- [x] D1 remote `library-db` áp dụng thành công migration `0001_docx_drop_mobi_cbz.sql`, giữ nguyên 49 cuốn EPUB và 4 tiến độ đọc, và Worker mới được deploy live (`b5f00281-9310-469b-a64a-120ab227535b`).
- [x] Tải lên file `.docx` trích xuất được ảnh bìa (`blob:` URL hiển thị trên `BookCard` + badge `DOCX`), tiêu đề/tác giả, chia đúng 2 chương theo `Heading 1`, hiển thị văn bản đậm/nghiêng, danh sách, bảng và ảnh nhúng (đã lọc trùng `mc:AlternateContent`) trong `ReaderView`, 0 lỗi console.
- [x] Thử nạp file `.mobi` và `.cbz` vào `UploadDropzone` bị từ chối rõ ràng với thông báo `Chỉ hỗ trợ EPUB, PDF hoặc DOCX.`.
