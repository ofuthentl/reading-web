# Kế hoạch Phase 3 — Hoàn thiện giao diện 2D & Deploy lên `ofu.lol`

> **Trạng thái:** Đã cập nhật theo review (chốt phương án 2); sẵn sàng thực hiện từ Sub-phase 3.0.
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

### Sub-phase 3.0 — Vá bảo mật Worker, tách `auth.ts`, khởi tạo D1/R2 & Deploy Worker
- **Mục tiêu:** Vá lỗ hổng bảo mật auth trước khi đưa Worker lên mạng, đưa `workers/r2-storage/src/index.ts` xuống ≤ 500 dòng, tạo hạ tầng Cloudflare (D1 + R2) và deploy Worker lên `*.workers.dev` để mọi bước UI sau đều test được với máy chủ thật (không ảnh hưởng `ofu.lol`).
- **File dự kiến tạo/sửa:**
  - Tạo `workers/r2-storage/src/auth.ts`: tách `timingSafeEqual`, `signPayload`, `createAuthToken`, `verifyAuth` từ `index.ts`.
  - Sửa `workers/r2-storage/src/index.ts` (giữ < 450 dòng):
    - **Vá fail-closed auth:** Bỏ fallback `'local-dev-secret'`. Khi chạy production (hoặc mặc định không có cờ `ALLOW_INSECURE_DEV_NO_AUTH = "true"`), nếu thiếu `ACCESS_PASSCODE` thì trả `503` ("Máy chủ chưa cấu hình ACCESS_PASSCODE"), tuyệt đối **không** tắt auth như dòng 144 cũ.
    - `AUTH_SECRET` dùng độc lập (nếu thiếu thì trả `503` hoặc chỉ fallback về `ACCESS_PASSCODE` khi có `ACCESS_PASSCODE`, không bao giờ dùng chuỗi cố định).
  - Tạo hạ tầng Cloudflare & cập nhật `workers/r2-storage/wrangler.toml`:
    - Chạy `wrangler r2 bucket create arcane-library-books`, `wrangler d1 create library-db`.
    - Điền `database_id` thật vào `workers/r2-storage/wrangler.toml`.
    - Chạy `npm run db:init:remote` (khởi tạo bảng `books` và `reading_progress`).
    - Người dùng đặt secret bằng `npx wrangler secret put ACCESS_PASSCODE` (dùng passcode ngẫu nhiên ≥ 20 ký tự để chống dò mò) và `npx wrangler secret put AUTH_SECRET`.
    - Chạy `npm run deploy` cho Worker; ghi `VITE_API_URL` vào `.env.local` (chạy thử local).
  - Cập nhật `docs/ARCHITECTURE.md` thêm `workers/r2-storage/src/auth.ts` và bỏ ghi chú `database_id` chưa điền.
- **Kiểm thử độc lập:** `cd workers/r2-storage && npm run typecheck`, ESLint `max-lines` cho `workers/` sạch; gọi `GET /api/health` thấy `authRequired: true`; gọi `GET /api/books` không token trả `401`.
- **Rủi ro:** CORS chặn request từ `localhost:5173` nếu `APP_ORIGINS` chưa khớp. **Giảm thiểu:** kiểm tra `APP_ORIGINS` trong `wrangler.toml` và test thử preflight `OPTIONS`.
- **Cách hoàn tác:** `npx wrangler rollback` cho Worker; `git revert <commit-3.0>`.

### Sub-phase 3.1 — `AuthGate` + `Toast` + `ErrorBoundary` + D-005 + Vỏ `App.tsx` tối giản (Build XANH)
- **Mục tiêu:** Làm build & dev server **xanh ngay từ 3.1** để mọi sub-phase sau đều chạy thử được trên trình duyệt với Worker thật. Xây nền tảng chống trắng trang, đăng nhập 1 passcode (D-003), và áp dụng D-005.
- **File dự kiến tạo/sửa:**
  - Sửa `src/lib/api.ts`: áp dụng D-005 — chỉ cho phép Local-First khi `import.meta.env.DEV && !API_BASE`; trên production (`!import.meta.env.DEV`) nếu thiếu `VITE_API_URL` thì xuất cờ `isMissingProductionApi` để hiển thị lỗi cấu hình rõ ràng thay vì lưu âm thầm vào IndexedDB.
  - Tạo `src/components/ErrorBoundary.tsx` (bắt lỗi render React, nút tải lại).
  - Tạo `src/components/ToastContainer.tsx` + `src/hooks/useToast.ts` (hiển thị thông báo lỗi/thành công không chặn UI).
  - Tạo `src/components/AuthGate.tsx` (gọi `checkHealth()` & `loginWithPasscode()`, hiển thị form passcode khi `authRequired` hoặc lỗi `401`, báo lỗi cấu hình rõ nếu `isMissingProductionApi`).
  - Sửa `src/main.tsx` (bọc `<ErrorBoundary>` quanh `<App />`).
  - Viết lại `src/App.tsx` thành **vỏ điều phối tối giản (< 100 dòng)**: nối `AuthGate` + `ToastContainer` + khung trạng thái thư viện tạm (hiển thị số sách/dung lượng từ `fetchLibraryState()` và nút Đăng xuất). *(Code `App.tsx` cũ tra lại qua `git show 253afeb:src/App.tsx`.)*
  - Sửa `eslint.config.js`: gỡ block override tạm `max-lines` cho `src/App.tsx`.
- **Kiểm thử độc lập:** `npm run typecheck` và `npm run build` **XANH 100%** từ mốc này; `npm run lint` chỉ còn lỗi `max-lines` ở `ReaderView.tsx`. Mở `npm run dev`: test đăng nhập sai/đúng passcode với Worker thật, F5 giữ phiên, test `npm run build` thiếu `VITE_API_URL` rồi `npm run preview` để kiểm chứng D-005.
- **Rủi ro:** Token hết hạn ở giữa phiên không tự đá về `AuthGate`. **Giảm thiểu:** tập trung bắt `isAuthError(err)` ở `App.tsx` để reset auth state + hiện toast.
- **Cách hoàn tác:** `git revert <commit-3.1>`.

### Sub-phase 3.2 — `Library2DView` (Kệ sách, Tiếp tục đọc, Tìm kiếm, Thanh dung lượng)
- **Mục tiêu:** Xây giao diện thư viện 2D gọn nhẹ và nối vào `App.tsx` để test trực tiếp trên trình duyệt; tải ảnh bìa nhẹ qua `fetchCoverBlobCached()` kèm `URL.revokeObjectURL`, thanh dung lượng `X / 9.0 GB` dùng `formatBytes()`.
- **File dự kiến tạo/sửa:**
  - Tạo `src/hooks/useCoverUrl.ts` (tải `Blob` qua `fetchCoverBlobCached`, tạo & thu hồi `ObjectURL` đúng vòng đời unmount/đổi `cover_key`).
  - Tạo `src/components/BookCard.tsx` (hiển thị bìa/màu fallback, tiến độ %, badge định dạng, chế độ chọn nhiều).
  - Tạo `src/components/LibraryHeader.tsx` (tách riêng phần header + thanh dung lượng `usedBytes / limitBytes` + nút upload/chế độ chọn/đăng xuất để `Library2DView.tsx` luôn gọn < 350 dòng).
  - Tạo `src/components/Library2DView.tsx` (khối "Tiếp tục đọc" sắp theo `progress.updatedAt`, ô tìm kiếm theo tên/tác giả/kệ, danh sách kệ từ `groupBooksIntoShelves()`).
  - Cập nhật `src/App.tsx`: hiển thị `<Library2DView>` sau khi qua `AuthGate`.
- **Kiểm thử độc lập:** `npm run typecheck` và `npm run build` xanh; mỗi file mới ≤ 500 dòng; mở `npm run dev` kiểm tra giao diện kệ sách, tìm kiếm, thanh dung lượng, và xác nhận mọi `createObjectURL` có `revokeObjectURL` trong cleanup.
- **Rủi ro:** Bìa tải đồng loạt quá nhiều request khi có hàng trăm sách. **Giảm thiểu:** `loading="lazy"` trên `<img>` và cache 0ms trong IndexedDB (`cover_blobs`).
- **Cách hoàn tác:** `git revert <commit-3.2>`.

### Sub-phase 3.3 — Upload kéo-thả nhiều file + Sửa thông tin / Đổi bìa / Xoá hàng loạt
- **Mục tiêu:** Hoàn thiện toàn bộ thao tác quản lý sách trên giao diện 2D, tái sử dụng `uploadBook`, `updateBookMetadata`, `updateBookCover`, `renameShelfAll`, `deleteBooks` từ `src/lib/api.ts`, test trực tiếp với R2/D1 thật.
- **File dự kiến tạo/sửa:**
  - Tạo `src/components/UploadDropzone.tsx` (kéo-thả hoặc chọn nhiều file EPUB/MOBI/PDF/CBZ, thanh tiến trình từng file, cảnh báo trùng tên qua `bookDuplicateKey()`, xử lý lỗi hạn mức 9.0 GB qua toast).
  - Tạo `src/components/BookEditModal.tsx` (đổi tiêu đề, tác giả, kệ, mô tả, đổi ảnh bìa mới qua `updateBookCover`).
  - Tạo `src/components/ShelfRenameModal.tsx` và `src/components/DeleteConfirmModal.tsx` (hỗ trợ xoá 1 sách hoặc xoá hàng loạt).
  - Cập nhật `src/components/Library2DView.tsx` và `src/App.tsx` (gắn nút upload, thanh thao tác hàng loạt, mở các modal; giữ mọi file ≤ 500 dòng).
- **Kiểm thử độc lập:** `npm run typecheck` và `npm run build` xanh; mở `npm run dev` upload thử cả 4 định dạng EPUB/PDF/CBZ/MOBI lên R2 thật, đổi tên/đổi bìa/đổi tên kệ, xoá sách và kiểm tra object trên R2 cũng bị xoá.
- **Rủi ro:** Upload nhiều file nặng song song làm nghẽn RAM trình duyệt khi giải nén trích bìa. **Giảm thiểu:** xử lý tuần tự từng file trong hàng đợi upload (1–2 file/lần) và giải phóng ngay sau mỗi file.
- **Cách hoàn tác:** `git revert <commit-3.3>`.

### Sub-phase 3.4 — Tách `ReaderView`, nối Trình đọc vào `App.tsx`, dọn `src/index.css` (Lint XANH 100%)
- **Mục tiêu:** Hoàn thiện luồng đọc sách qua `ReaderView` / `PdfReader`, tách gọn `ReaderView.tsx` (hiện 673 dòng hiệu dụng) xuống ≤ 500 dòng, và dọn sạch CSS cũ để toàn bộ `typecheck`, `lint`, `build` đều xanh.
- **File dự kiến tạo/sửa:**
  - Tạo `src/components/ReaderSettingsPopover.tsx` và `src/components/ReaderTocDrawer.tsx` (tách từ `src/components/ReaderView.tsx` theo trách nhiệm UI).
  - Sửa `src/components/ReaderView.tsx` (nhập 2 component vừa tách, giữ < 400 dòng).
  - Sửa `src/index.css`: xoá các class `.pdf-reader*`, `.pdf-toolbar*`, `.pdf-thumbnails*`, `.pdf-page-stage*` đã lỗi thời; định nghĩa `.font-reader-serif`, `.font-reader-sans`, `.font-reader-mono` mà `ReaderView.tsx` đang dùng.
  - Cập nhật `src/App.tsx` (giữ **< 200 dòng**): mở sách qua `fetchBookBlobCached` + `parseBookBlob`, gọi `parsedBook.dispose()` chắc chắn khi đóng/đổi sách/unmount, lưu tiến độ qua `saveReadingProgress`, quản lý `ReaderSettings` trong `localStorage`.
  - Cập nhật `docs/ARCHITECTURE.md` phản ánh đầy đủ các module và hook mới.
- **Kiểm thử độc lập:** `npm run typecheck`, `npm run lint`, `npm run build` và `cd workers/r2-storage && npm run typecheck` đều **0 lỗi, 0 cảnh báo**. Chạy `npm run dev` đọc thử cả 4 định dạng với Worker thật.
- **Rủi ro:** Rò rỉ `ObjectURL` nếu đóng sách trong lúc `parseBookBlob` đang chạy bất đồng bộ. **Giảm thiểu:** dùng biến `cancelled` / request ID trong `App.tsx`, nếu đã đóng trước khi parse xong thì gọi `parsed.dispose()` ngay lập tức.
- **Cách hoàn tác:** `git revert <commit-3.4>`.

### Sub-phase 3.5 — Kiểm thử toàn diện & Cấu hình Secret Deploy
- **Mục tiêu:** Chạy qua toàn bộ checklist kiểm thử với Cloudflare Worker + D1 + R2 thật trước khi mở PR.
- **Thao tác:**
  - Thực hiện toàn bộ 10 mục trong **Checklist chạy thử thủ công** (Mục 3) và 12 mục trong **Lỗi bản cũ cần xác minh đã hết** (Mục 4).
  - Cấu hình `VITE_API_URL` vào GitHub Actions Secret (chuẩn bị cho `.github/workflows/deploy.yml`).
  - Rà soát `HANDOFF.md` và `docs/ARCHITECTURE.md` lần cuối trước PR.
- **Cách hoàn tác:** Sửa lỗi phát hiện được bằng commit `fix: ...` riêng trên nhánh hiện tại.

### Sub-phase 3.6 — Pull Request → CI xanh → Duyệt → Merge & Dọn hậu kỳ
- **Mục tiêu:** Đưa bản 2D mới lên production an toàn theo D-006 và hoàn tất D-001.
- **Thao tác:**
  - Tạo Pull Request từ `feat/migrate-cloudflare` vào `main`.
  - Xác nhận cả 2 job CI (`Frontend` và `Worker`) đều **xanh**.
  - Người dùng review & duyệt PR → Merge vào `main`.
  - Theo dõi `.github/workflows/deploy.yml` deploy xong, mở `https://ofu.lol` kiểm tra đăng nhập, tải sách và đọc thử trên cả PC lẫn mobile.
  - **Dọn hậu kỳ (sau khi `ofu.lol` chạy ổn):** Người dùng xoá project Supabase cũ và xoá các secret Supabase cũ trên GitHub (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` nếu còn).
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

- **Khuyến nghị & điểm yếu của phương án chọn:** Chọn thay `src/App.tsx` bằng vỏ điều phối tối giản ngay từ 3.1 (`AuthGate` → `Library2DView` → Upload/Modal → `ReaderView`). **Điểm yếu:** trong các bước 3.1–3.3, một số tính năng chưa nối sẽ tạm chưa có trên UI nhánh dev (nhưng app vẫn build xanh và test được ngay từng phần; code cũ vẫn tra lại được qua `git show 253afeb:src/App.tsx`).
