# HANDOFF
Cập nhật: 2026-11-21 22:37 | Nhánh: feat/shelf-cover-and-metadata | Build: 🟢 frontend (entry <= 86.04 kB gzip, 0 B three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất sửa Metadata Tên Sách/Kệ, Chọn Ảnh Bìa Kệ & Ghim Kệ Yêu Thích (`feat/shelf-cover-and-metadata`, `D-025`)** — sẵn sàng chạy migrate/deploy Worker & mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/shelf-metadata-and-cover.md

## Đang làm dở
- Đã hoàn tất trọn vẹn 4 hạng mục trên nhánh `feat/shelf-cover-and-metadata` (xếp trên `fix/post-4a-cleanup`):
  1. **Sửa dư dấu `-` / `–` cuối tên kệ (`Chitose - Tập 1.epub` → kệ `"Chitose"`):** hỗ trợ đầy đủ dấu gạch/hai chấm Unicode (`cleanShelfLabel`, `extractSeriesName`, `inferBatchCommonShelf`).
  2. **Sửa nhận nhầm `Tập X：Tên tập` thành tên tác giả (`Black Bullet：New World Order - Tập 1：...`):** bổ sung `VOLUME_WITH_SUBTITLE_RE` giữ trọn tên tập trong `title`, đặt `author = "Không rõ tác giả"` (và tự làm sạch hiển thị `getDisplayAuthor` / `getBookSortTitle` cho cả sách cũ đã tải lên).
  3. **Chọn ảnh bìa kệ từ 1 tập bất kỳ (`ShelfCoverPickerModal.tsx`, `D-025`):** chọn trực tiếp trong `ShelfDetailView` hoặc trên thẻ `ShelfCoverCard` (có nút đặt lại Tập 1 mặc định, tốn `0 B` thêm trên R2).
  4. **Yêu thích kệ sách (`Star` ghim lên đầu cả `Trang chủ` lẫn `Thư viện`, `D-025`):** đồng bộ đa thiết bị qua bảng `shelf_prefs` trên Cloudflare D1 (`PUT /api/shelves/cover`, `PUT /api/shelves/favorite`) kèm cache `localStorage`; nạp lười `UploadDropzone` giúp giảm mạnh dung lượng entry 2D.

## Bước tiếp theo
1. Chạy migrate D1 & deploy Cloudflare Worker cho bảng `shelf_prefs`:
   - `cd workers/r2-storage && npx wrangler d1 migrations apply library-db --remote && npx wrangler deploy`
2. Merge PR `fix/post-4a-cleanup` → `main` (nếu chưa merge), sau đó mở & merge PR `feat/shelf-cover-and-metadata` → `main`.
3. Chuyển sang chuẩn bị **PR 4B (`feat/book-spread-reader`)**: đọc mã nguồn `MengTo/sketchbook`, cập nhật `docs/plans/phase-4b-book-spread-reader.md` và chờ duyệt.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/shelf-cover-and-metadata` (`D-025`):** sửa tách tên kệ/tác giả Unicode, thêm `shelf_prefs` D1 + Worker API, chọn ảnh bìa kệ từ tập bất kỳ & ghim kệ yêu thích lên đầu Trang chủ + Thư viện.
- **Bước 0 (`fix/post-4a-cleanup`):** vá `paused`/giữ nền 3D khi mở sách & modal, dọn `mountain-stairs.glb` thừa.
