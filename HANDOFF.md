# HANDOFF
Cập nhật: 2026-11-21 04:08 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 83.74 kB gzip, 0 B three · chunk 3D lazy 239.94 kB gzip) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Hoàn tất toàn bộ **PR 4A (`Sub-phase 4A.1` → `4A.4`)** — sẵn sàng kiểm thử trình duyệt cuối cùng & mở PR merge vào `main`
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-3d.md

## Đang làm dở
- **Sub-phase 4A.4 xong & kiểm định tự động PR 4A XANH 100%:**
  - `BookInspectCard.tsx`: thẻ xem nhanh sách đang chọn/hover với ảnh bìa gốc qua `useCoverUrl`, metadata, badge định dạng, dung lượng, thanh tiến độ %, nút **"Đọc sách / Đọc tiếp"**, **"Chọn / Đã chọn"** (khi bật chọn nhiều), **"Sửa"** (`BookEditModal`) và đóng thẻ (`Esc`).
  - `Library3DOverlay.tsx`: HTML overlay hoàn chỉnh (`Header z-30`, HUD `<= z-20`, vùng trống `pointer-events-none`) dùng chung state `App.tsx`: tìm kiếm không dấu, chips lọc & bay camera tới kệ, nút bước kệ `←`/`→`, **"Đổi tên kệ"** (`ShelfRenameModal`), thanh chọn nhiều (`Chọn tất cả`, `Chuyển kệ (N)` → `BulkShelfModal`, `Xoá đã chọn (N)` → `DeleteConfirmModal`, `Xong`), ngăn **"Tiếp tục đọc"** thu gọn góc dưới-trái, trạng thái trống/không khớp lọc.
  - `geometryUtils.ts`: thay `BufferGeometryUtils` nặng bằng `mergeSimpleGeometries` nội bộ, giữ chunk 3D lazy **`239.94 kB gzip <= 240 kB gzip`** và entry **`83.74 kB gzip <= 86.04 kB gzip`**.
  - Đã điền bảng số đo bundle PR 4A và tick Mục 7A trong `docs/plans/phase-4-3d.md`.
- Thư mục ảnh tham khảo local `library_sample/` vẫn giữ untracked (không commit).

## Bước tiếp theo
1. Người dùng test checklist PR 4A (Mục 7B–7D trong `docs/plans/phase-4-3d.md`) trên trình duyệt (`npm run build && npm run preview -- --port 5173 --strictPort`).
2. Push nhánh `feat/library-3d`, mở **PR 4A → `main`**, chờ CI xanh và merge vào `main`.
3. Sau khi PR 4A merge, tách nhánh mới `feat/book-spread-reader` từ `origin/main` để bắt đầu **Phần B (PR 4B — `BookSpreadReader` mở đôi 2 trang)**.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A.4 (`feat/library-3d`):** hoàn thiện `BookInspectCard.tsx`, `Library3DOverlay.tsx`, `geometryUtils.ts`, nối trọn vẹn 5 modal `z-40` + `ToastContainer z-50` vào `FantasyLibrary3D.tsx`, cập nhật `ARCHITECTURE.md` & `phase-4-3d.md`.
- **Sub-phase 4A.1 → 4A.3 (`feat/library-3d`):** ranh giới D-008, 3 module lõi 3D thuần, cảnh Đại sảnh cổ điển 2 tầng `frameloop="demand"`, 3 `InstancedMesh` + `<= 20–24` `CoverPlane`, vá tương phản HUD `bg-surface/95`.
