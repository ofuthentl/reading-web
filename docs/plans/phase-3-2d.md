# Kế hoạch Phase 3 — Hoàn thiện giao diện 2D & Deploy lên `ofu.lol`

> **Trạng thái:** Chờ người dùng review và duyệt trước khi code.
> **Nhánh triển khai:** `feat/migrate-cloudflare` (tiếp nối từ Phase 0–2).
> **Ràng buộc liên quan:** D-001 → D-007 (`docs/DECISIONS.md`), mọi file ≤ 500 dòng (`AGENTS.md`).

## 1. Mục tiêu ("Định nghĩa xong")
- `src/App.tsx` trở thành vỏ điều phối mỏng **dưới 200 dòng** (quản lý auth state, trạng thái thư viện, chuyển đổi Library ↔ Reader, Toast).
- Mọi file `.ts` / `.tsx` trong cả frontend và `workers/r2-storage` đều **≤ 500 dòng hiệu dụng**; gỡ hoàn toàn override `max-lines` cho `src/App.tsx` trong `eslint.config.js`.
- `npm run typecheck`, `npm run lint`, `npm run build` và `workers/r2-storage` `npx tsc --noEmit` đều **xanh 100%**.
- Hoàn thành checklist kiểm thử thủ công với Cloudflare Worker + D1 + R2 thật.
- Merge qua Pull Request vào `main` và chạy ổn định trên `https://ofu.lol`.

---

## 2. Lộ trình từng Sub-phase (mỗi sub-phase = 1 commit độc lập)

### Sub-phase 3.1 — `AuthGate` + `Toast` + `ErrorBoundary`
- **Mục tiêu:** Xây nền tảng bảo vệ toàn app (không trắng trang khi gặp lỗi runtime/mạng) và màn hình đăng nhập 1 passcode theo D-003.
- **File dự kiến tạo/sửa:**
  - Tạo `src/components/ErrorBoundary.tsx` (bắt lỗi render React, nút tải lại).
  - Tạo `src/components/ToastContainer.tsx` + `src/hooks/useToast.ts` (hiển thị thông báo lỗi/thành công không chặn UI).
  - Tạo `src/components/AuthGate.tsx` (gọi `checkHealth()` & `loginWithPasscode()`, hiển thị form passcode khi `authRequired` hoặc nhận lỗi `401`, hiển thị lỗi cấu hình rõ ràng khi cần).
  - Sửa `src/main.tsx` (bọc `<ErrorBoundary>` quanh `<App />`).
- **Kiểm thử độc lập:** Kiểm tra `npx tsc --noEmit` riêng các file mới + review UI component (chưa nối `App.tsx` nên full build vẫn đỏ tới 3.4).
- **Rủi ro:** Token hết hạn ở giữa phiên không tự đá về `AuthGate`. **Giảm thiểu:** tập trung bắt `isAuthError(err)` ở tầng điều phối `App.tsx` để reset trạng thái auth + báo toast.
- **Cách hoàn tác:** `git revert <commit-3.1>` (không ảnh hưởng dữ liệu hay component khác).

### Sub-phase 3.2 — `Library2DView` (Kệ sách, Tiếp tục đọc, Tìm kiếm, Thanh dung lượng)
- **Mục tiêu:** Xây giao diện thư viện 2D gọn nhẹ, tải ảnh bìa nhẹ qua `fetchCoverBlobCached()` kèm `URL.revokeObjectURL`, thanh dung lượng `X / 9.0 GB` dùng `formatBytes()`.
- **File dự kiến tạo/sửa:**
  - Tạo `src/hooks/useCoverUrl.ts` (tải `Blob` qua `fetchCoverBlobCached`, tạo & thu hồi `ObjectURL` đúng vòng đời unmount/đổi `cover_key`).
  - Tạo `src/components/BookCard.tsx` (hiển thị bìa/màu fallback, tiến độ %, badge định dạng, chế độ chọn nhiều).
  - Tạo `src/components/Library2DView.tsx` (header + thanh dung lượng `usedBytes / limitBytes`, khối "Tiếp tục đọc" sắp theo `progress.updatedAt`, ô tìm kiếm theo tên/tác giả/kệ, danh sách kệ từ `groupBooksIntoShelves()`).
- **Kiểm thử độc lập:** Kiểm tra typecheck từng file mới + xác nhận mỗi file < 500 dòng; kiểm tra mọi `createObjectURL` đều có `revokeObjectURL` trong cleanup.
- **Rủi ro:** Bìa tải đồng loạt quá nhiều request khi có hàng trăm sách. **Giảm thiểu:** `loading="lazy"` trên `<img>` và cache 0ms trong IndexedDB (`cover_blobs`).
- **Cách hoàn tác:** `git revert <commit-3.2>`.

### Sub-phase 3.3 — Upload kéo-thả nhiều file + Sửa thông tin / Đổi bìa / Xoá hàng loạt
- **Mục tiêu:** Hoàn thiện toàn bộ thao tác quản lý sách trên giao diện 2D, tái sử dụng `uploadBook`, `updateBookMetadata`, `updateBookCover`, `renameShelfAll`, `deleteBooks` từ `src/lib/api.ts`.
- **File dự kiến tạo/sửa:**
  - Tạo `src/components/UploadDropzone.tsx` (kéo-thả hoặc chọn nhiều file EPUB/MOBI/PDF/CBZ, thanh tiến trình từng file, cảnh báo trùng tên qua `bookDuplicateKey()`, xử lý lỗi hạn mức 9.0 GB qua toast).
  - Tạo `src/components/BookEditModal.tsx` (đổi tiêu đề, tác giả, kệ, mô tả, đổi ảnh bìa mới qua `updateBookCover`).
  - Tạo `src/components/ShelfRenameModal.tsx` và `src/components/DeleteConfirmModal.tsx` (hỗ trợ xoá 1 sách hoặc xoá hàng loạt).
  - Cập nhật `src/components/Library2DView.tsx` (gắn nút upload, thanh thao tác hàng loạt, mở modal).
- **Kiểm thử độc lập:** Kiểm tra typecheck/lint trên toàn bộ `src/components/` mới.
- **Rủi ro:** Upload nhiều file nặng song song làm nghẽn RAM trình duyệt khi giải nén trích bìa. **Giảm thiểu:** xử lý tuần tự từng file trong hàng đợi upload (1–2 file/lần) và giải phóng ngay sau mỗi file.
- **Cách hoàn tác:** `git revert <commit-3.3>`.

### Sub-phase 3.4 — Nối `ReaderView` / `PdfReader`, thay thế hoàn toàn `App.tsx`, gỡ override `max-lines`
- **Mục tiêu:** Thay toàn bộ `src/App.tsx` cũ (~2.958 dòng) bằng vỏ mỏng < 200 dòng nối `AuthGate` + `Library2DView` + `ReaderView` + `ToastContainer`; tách gọn `ReaderView.tsx` (hiện 673 dòng hiệu dụng) xuống ≤ 500 dòng; gỡ override `max-lines` cho `src/App.tsx`.
- **File dự kiến tạo/sửa:**
  - Tạo `src/components/ReaderSettingsPopover.tsx` và `src/components/ReaderTocDrawer.tsx` (tách từ `src/components/ReaderView.tsx` theo trách nhiệm UI).
  - Sửa `src/components/ReaderView.tsx` (nhập 2 component vừa tách, giữ < 400 dòng).
  - Viết lại `src/App.tsx` (< 200 dòng): mở sách qua `fetchBookBlobCached` + `parseBookBlob`, gọi `parsedBook.dispose()` chắc chắn khi đóng sách/đổi sách/unmount, lưu tiến độ qua `saveReadingProgress`, quản lý `ReaderSettings` trong `localStorage` (chỉ JSON nhỏ vài trăm byte).
  - Sửa `eslint.config.js`: gỡ block override tạm cho `src/App.tsx`.
- **Kiểm thử độc lập:** Chạy `npm run typecheck`, `npm run build` (bắt đầu **XANH** từ mốc này), chạy `npm run dev` test chế độ Local-First trên trình duyệt.
- **Rủi ro:** Rò rỉ `ObjectURL` nếu đóng sách trong lúc `parseBookBlob` đang chạy bất đồng bộ. **Giảm thiểu:** dùng biến `cancelled` / request ID trong `App.tsx`, nếu đã đóng trước khi parse xong thì gọi `parsed.dispose()` ngay lập tức.
- **Cách hoàn tác:** `git revert <commit-3.4>` (hoặc khôi phục commit trước nếu cần đối chiếu tính năng cũ).

### Sub-phase 3.5 — Áp dụng D-005 + Dọn `src/index.css` + Tách gọn Worker dưới 500 dòng
- **Mục tiêu:** Chặn fallback Local-First trên bản production (D-005), dọn sạch CSS thừa của `PdfReader` cũ, bổ sung class font cho `ReaderView`, và làm sạch lỗi ESLint `max-lines` còn lại ở Worker (hiện 505 dòng hiệu dụng).
- **File dự kiến tạo/sửa:**
  - Sửa `src/lib/api.ts`: chỉ cho phép Local-First khi `import.meta.env.DEV && !API_BASE`; trên production (`!import.meta.env.DEV`) nếu thiếu `VITE_API_URL` thì xuất cờ cấu hình lỗi (`isMissingProductionApi`) để `App.tsx` / `AuthGate` hiển thị thông báo lỗi rõ ràng thay vì lưu âm thầm vào IndexedDB.
  - Sửa `src/index.css`: xoá các class `.pdf-reader*`, `.pdf-toolbar*`, `.pdf-thumbnails*`, `.pdf-page-stage*` đã lỗi thời; định nghĩa `.font-reader-serif`, `.font-reader-sans`, `.font-reader-mono` mà `ReaderView.tsx` đang dùng.
  - Tách `workers/r2-storage/src/auth.ts` (HMAC sign/verify, `timingSafeEqual`, `createAuthToken`, `verifyAuth`) từ `workers/r2-storage/src/index.ts` để cả 2 file đều < 450 dòng.
  - Cập nhật `docs/ARCHITECTURE.md` phản ánh các module mới.
- **Kiểm thử độc lập:** `npm run typecheck`, `npm run lint`, `npm run build` và `cd workers/r2-storage && npx tsc --noEmit` đều **0 lỗi, 0 cảnh báo**. Thử `npm run build` không có `VITE_API_URL` rồi `npm run preview` để xác minh thông báo lỗi D-005.
- **Rủi ro:** Tách file Worker có thể sai đường dẫn import ES module trên Wrangler bundler. **Giảm thiểu:** chạy `npx tsc --noEmit` và `npx wrangler dev` kiểm chứng ngay.
- **Cách hoàn tác:** `git revert <commit-3.5>`.

### Sub-phase 3.6 — Khởi tạo Cloudflare D1/R2, Deploy Worker, Chạy thử end-to-end
- **Mục tiêu:** Đưa hạ tầng Cloudflare thật lên hoạt động và kiểm thử toàn bộ checklist trên máy local nối trực tiếp vào Worker thật.
- **Thao tác & File sửa:**
  - Người dùng/agent chạy `wrangler r2 bucket create arcane-library-books`, `wrangler d1 create library-db`.
  - Cập nhật `database_id` thật vào `workers/r2-storage/wrangler.toml`.
  - Chạy `npm run db:init:remote` (khởi tạo bảng `books` và `reading_progress`).
  - Người dùng đặt secret bằng `npx wrangler secret put ACCESS_PASSCODE` và `npx wrangler secret put AUTH_SECRET`.
  - Chạy `npm run deploy` cho Worker; cập nhật `VITE_API_URL` vào `.env.local` (chạy thử) và GitHub Actions Secret (chuẩn bị deploy).
- **Kiểm thử độc lập:** Thực hiện toàn bộ 10 mục trong **Checklist chạy thử thủ công** (Mục 3) và 12 mục trong **Lỗi bản cũ cần xác minh đã hết** (Mục 4).
- **Rủi ro:** CORS chặn request từ `localhost:5173` hoặc `https://ofu.lol` nếu thiếu header/origin. **Giảm thiểu:** đối chiếu `APP_ORIGINS` trong `wrangler.toml` và kiểm tra tab Network khi test `PUT /api/books/:id/file` và `PATCH`.
- **Cách hoàn tác:** `wrangler rollback` cho Worker; `git revert <commit-3.6>` nếu cần sửa `wrangler.toml`.

### Sub-phase 3.7 — Pull Request → CI xanh → Duyệt → Merge & Xác minh `ofu.lol`
- **Mục tiêu:** Đưa bản 2D mới lên production an toàn theo D-006.
- **Thao tác:**
  - Tạo Pull Request từ `feat/migrate-cloudflare` vào `main`.
  - Xác nhận cả 2 job CI (`Frontend` và `Worker`) đều **xanh**.
  - Người dùng review & duyệt PR → Merge vào `main`.
  - Theo dõi `.github/workflows/deploy.yml` deploy xong, mở `https://ofu.lol` kiểm tra đăng nhập, tải sách và đọc thử trên cả PC lẫn mobile.
- **Rủi ro:** Cache trình duyệt giữ bản cũ hoặc thiếu secret `VITE_API_URL` trên GitHub. **Giảm thiểu:** kiểm tra secret trước khi merge; nếu sự cố, rollback nhanh bằng revert PR trên `main`.
- **Cách hoàn tác:** GitHub "Revert" Pull Request để trả `main` về trạng thái trước đó.

---

## 3. Checklist chạy thử thủ công (bắt buộc qua hết trước khi merge)
- [ ] **Đăng nhập passcode:** Sai passcode báo lỗi rõ; đúng passcode vào thư viện; F5 giữ đăng nhập (token 30 ngày); bấm Đăng xuất đá về `AuthGate`.
- [ ] **Upload đủ 4 định dạng:** EPUB, PDF, CBZ, MOBI đều upload thành công, xuất hiện đúng trên kệ.
- [ ] **Ảnh bìa nhẹ không tải cả file:** F5 trang thư viện, mở DevTools Network → chỉ thấy request `/api/files/covers/...` (~30–60 KB), **không** có request `/api/files/books/...`.
- [ ] **Mở lại sách từ cache:** Mở 1 cuốn sách lần 1 (nhãn `R2 Ready`), đóng lại, mở lần 2 → nhãn `Cache 0ms`, mở tức thì và không có request mạng tải lại file sách.
- [ ] **Lưu & khôi phục tiến độ đọc:** Đọc giữa chương, cuộn xuống 50%, thoát ra, mở lại (và thử ở trình duyệt/thiết bị khác) → khôi phục đúng chương và tỉ lệ cuộn.
- [ ] **Xoá sách sạch cả R2:** Xoá 1 sách và xoá hàng loạt → kiểm tra trong Cloudflare Dashboard (hoặc `GET /api/files/<key>` trả 404) xác nhận cả file sách lẫn ảnh bìa đã biến mất trên R2.
- [ ] **Không rò rỉ RAM khi đổi sách:** Mở/đóng luân phiên 5–10 cuốn EPUB/CBZ/PDF có nhiều ảnh → chụp Heap Snapshot trong DevTools Memory xác nhận bộ nhớ không tăng tuyến tính và ObjectURL cũ đã được thu hồi.
- [ ] **Phím `←`/`→` an toàn:** Gõ vào ô tìm kiếm thư viện hoặc ô lọc mục lục trong Reader → phím `←`/`→` chỉ di chuyển con trỏ chữ, không chuyển chương. Khi đã đóng Reader → `←`/`→` không kích hoạt gì.
- [ ] **Rớt mạng không trắng trang:** Bật Offline trong DevTools Network rồi thử đổi tên/xoá/upload → hiện toast báo lỗi dễ hiểu, giao diện vẫn thao tác bình thường.
- [ ] **Thanh dung lượng chính xác:** Upload thêm sách → dung lượng tăng đúng bằng `file_size + cover_size`; xoá sách → dung lượng giảm khớp về đúng giá trị trong D1 (`X / 9.0 GB`).

---

## 4. Lỗi bản cũ cần xác minh đã hết

- [ ] **Tải nguyên cuốn sách để lấy ảnh bìa:** *Kiểm chứng:* Mở DevTools Network khi tải trang thư viện — chỉ tải `covers/*.jpg`, không gọi `books/*`.
- [ ] **Xoá sách không xoá file R2:** *Kiểm chứng:* Xoá sách rồi kiểm tra R2 bucket hoặc gọi `/api/files/<file_key>` & `<cover_key>` đều trả `404`.
- [ ] **Mở lại sách phải tải lại qua mạng:** *Kiểm chứng:* Mở sách lần 2 ở chế độ Offline (DevTools) vẫn đọc được tức thì từ IndexedDB `book_blobs`.
- [ ] **PDF `getTextContent` toàn bộ trang + không `destroy` + parse 2 lần:** *Kiểm chứng:* Kiểm tra `src/lib/parsers.ts` (`parsePdfBlob` chỉ đọc `pdf.numPages` rồi `loadingTask.destroy()`) và `PdfReader.tsx` (dọn `loadingTask.destroy()` khi unmount); mở file PDF lớn >100 trang trong < 1 giây.
- [ ] **Không `revokeObjectURL`:** *Kiểm chứng:* Kiểm tra `ParsedBook.dispose()` được gọi trong `App.tsx` khi đóng/đổi sách và `useCoverUrl` gọi `URL.revokeObjectURL` trong `useEffect` cleanup.
- [ ] **`PdfReader` không huỷ `RenderTask` cũ + `renderError` không reset:** *Kiểm chứng:* Bấm liên tục nút trang sau/zoom nhanh trên PDF nhiều trang — không lỗi canvas; mở lại PDF hợp lệ sau 1 file lỗi — `renderError` reset về `null`.
- [ ] **EPUB `Promise.all` ghi chung `Set` + xoá ảnh lặp:** *Kiểm chứng:* Mở EPUB có ảnh lặp lại ở nhiều chương (hoặc hoa văn ngăn đoạn) — `parseEpubBlob` dùng `imageUrlByZipPath` map tái sử dụng cùng 1 URL, mọi ảnh đều hiển thị đầy đủ.
- [ ] **Phím `←`/`→` chạy cả khi đang gõ chữ hoặc khi reader đóng:** *Kiểm chứng:* `ReaderView` chỉ gắn listener khi đang mount và bỏ qua khi `target` là `input`/`textarea`/`contentEditable`.
- [ ] **Ảnh bìa base64 lưu `localStorage`:** *Kiểm chứng:* Mở DevTools → Application → Local Storage — chỉ có token và cài đặt đọc nhỏ, tuyệt đối không có chuỗi `data:image` hay cover base64.
- [ ] **Dòng chữ tràn hết chiều ngang màn hình PC:** *Kiểm chứng:* Mở EPUB/MOBI trên màn hình ≥ 1440px — nội dung giới hạn theo `maxWidth` (`42rem` / `52rem` / `64rem`) và căn giữa.
- [ ] **Hardcode `/bạch dạ hành/i`:** *Kiểm chứng:* Grep toàn repo không còn chuỗi `bạch dạ hành` hay hardcode tên sách riêng lẻ nào.
- [ ] **Lỗi mạng nhỏ làm trắng toàn trang:** *Kiểm chứng:* Giả lập 500/Offline trong DevTools — chỉ hiện Toast lỗi, `ErrorBoundary` đỡ nếu có lỗi render bất ngờ.

---

## 5. Phương án khác đã cân nhắc (cho cách tách `src/App.tsx`)

| Tiêu chí | Phương án chọn: **Viết mới các module 2D gọn + thay thế `App.tsx` theo 4 sub-phase (3.1–3.4)** | Phương án loại A: **Refactor tại chỗ `src/App.tsx` cũ rồi rút dần từng khối** | Phương án loại B: **Viết lại toàn bộ 1 lần trong 1 commit lớn kèm luôn Router (`react-router-dom`)** |
|---|---|---|---|
| **Rủi ro** | Thấp–trung bình: code cũ và mới không trộn lẫn, dễ đối chiếu hành vi cần giữ. | Cao: `App.tsx` cũ gắn chặt Supabase Auth/User/Share/Admin ở khắp ~2.958 dòng, sửa từng mảnh dễ để sót logic chết hoặc bug cũ. | Cao: 1 PR/commit khổng lồ khó review, khó khoanh vùng lỗi, thêm dependency không cần thiết cho 2 màn hình (Library/Reader). |
| **Công sức** | Trung bình: tận dụng sẵn `api.ts`, `cache.ts`, `parsers.ts`, `ReaderView.tsx`, `PdfReader.tsx`. | Cao: mất nhiều công gỡ rác Supabase và xử lý type lỗi tạm thời qua nhiều bước. | Cao: vừa viết UI vừa đổi mô hình điều hướng. |
| **Khả năng hoàn tác** | Tốt: mỗi sub-phase là 1 commit nhỏ, `git revert` sạch. | Kém: các commit đan xen khó tách. | Kém: phải revert cả khối lớn. |

- **Khuyến nghị & điểm yếu của phương án chọn:** Chọn viết mới từng lớp (`AuthGate` → `Library2DView` → Upload/Modal → nối `App.tsx`). **Điểm yếu:** trong 3 sub-phase đầu (3.1–3.3), full `npm run build` vẫn đỏ cho đến khi sub-phase 3.4 thay thế `App.tsx`; cần kiểm tra typecheck/lint riêng trên các file mới ở 3.1–3.3 trước khi nối hoàn chỉnh ở 3.4.
