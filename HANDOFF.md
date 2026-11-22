# HANDOFF
Cập nhật: 2026-11-22 23:37 | Nhánh: feat/miku-cursors | Build: 🟢 frontend (`85.38 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất bộ con trỏ chuột động 12 khung Hatsune Miku (`mikuCursorAnimator.ts` + `miku-sheet.png`) & cân bằng chiều cao nút có huy hiệu số (`ShelfDetailView`, `LibraryHeader`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/cover-aspect-ratio.md

## Đang làm dở
- Trên nhánh `feat/miku-cursors` (đã rebase sạch trên `origin/main` sau PR #12):
  1. **Bộ con trỏ chuột ĐỘNG 12 khung Hatsune Miku (`public/cursors/miku-sheet.png` `20.08 KB`, `src/lib/mikuCursorAnimator.ts`, `src/assets/cursors/*.png`, `src/index.css`):** phát đầy đủ chuyển động `.ani` gốc ở nhịp chuẩn `84ms`/khung (chớp mắt, bấm nút, quay hành, khóc `🚫`, ôm tim đập `💗` trên nút Yêu thích / Ủng hộ, cầm bút trên nút Sửa / Ghi chú, lấp lánh sao zoom ảnh...), tự dừng `0 FPS` khi ẩn tab hoặc `prefers-reduced-motion`, thu hồi sạch `URL.revokeObjectURL`.
  2. **Sửa phồng chiều cao nút có huy hiệu đếm số (`ShelfDetailView.tsx`, `LibraryHeader.tsx`):** cố định `h-[18px] leading-none` cho huy hiệu số trên nút `Thêm ghi chú` và nút `Bảo mật` để bằng khít `38px` với các nút bên cạnh.

## Bước tiếp theo
1. Mở Pull Request `feat/miku-cursors` vào `main` và bấm Merge khi CI xanh để đưa lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #12 (`D-031` tỉ lệ bìa `7:10` + tự động đồng bộ ngầm & sửa tràn tiêu đề modal):** đã merge vào `main`.
- **PR #11 (`feat/shelf-member-access`, `D-030`):** đã merge vào `main`.
