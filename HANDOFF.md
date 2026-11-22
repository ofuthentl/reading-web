# HANDOFF
Cập nhật: 2026-11-22 23:25 | Nhánh: feat/miku-cursors | Build: 🟢 frontend (`85.33 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Tích hợp bộ con trỏ chuột pixel-art Hatsune Miku (`src/assets/cursors/` + `src/index.css`) kèm sửa tràn tiêu đề modal & chuẩn hoá tỉ lệ bìa `7:10` (`D-031`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/cover-aspect-ratio.md

## Đang làm dở
- Trên nhánh mới `feat/miku-cursors` (tách sạch từ `origin/main` sau khi merge PR #11):
  1. **Sửa tràn tiêu đề modal (`ShelfBatchNoteModal.tsx`, `ShelfCoverPickerModal.tsx`, `ShelfAccessModal.tsx`):** thêm `min-w-0 flex-1` cho khối tiêu đề và `shrink-0` cho nút đóng `X`, tách dòng thống kê `Trống ghi chú / Chưa rõ tác giả`.
  2. **Chuẩn hoá tỉ lệ bìa `7:10` & tự động đồng bộ ngầm 1 lần (`D-031` — Worker đã deploy live):** bỏ crop cứng `480×720`, giữ nguyên tỉ lệ gốc ảnh bìa (`-v2.jpg`), đổi khung UI sang `aspect-[7/10]` chuẩn Light Novel A6 / PDF A4 và tự khôi phục ngầm toàn bộ bìa cũ khi Admin mở trang (`0` nút thừa, `0` đụng chạm `guest-packs`).
  3. **Bộ con trỏ chuột Hatsune Miku (`src/assets/cursors/*.png`, `src/index.css`):** trích xuất 11 trạng thái cần thiết (`default`, `pointer`, `text`, `not-allowed`, `wait`, `progress`, `help`, `move`/`grab`, `precision`/`zoom-in`, `ew-resize`, `ns-resize`, tổng `4.9 KB` PNG 32-bit không nén mờ, căn chuẩn toạ độ hotspot từng pixel, chỉ kích hoạt khi `(hover: hover) and (pointer: fine)`, `0 B` tăng thêm ở JS bundle).

## Bước tiếp theo
1. Mở Pull Request `feat/miku-cursors` vào `main` và bấm Merge khi CI xanh để đưa toàn bộ lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #11 (`feat/shelf-member-access`, `D-030`):** đã merge vào `main`.
- **`feat/web-2d-enhancements` (`D-029`)** & **PR #10 (`D-028`):** đã merge vào `main`.
