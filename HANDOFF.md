# HANDOFF
Cập nhật: 2026-11-22 23:32 | Nhánh: feat/miku-cursors | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất bộ con trỏ chuột động 12 khung Hatsune Miku (`mikuCursorAnimator.ts` + `miku-sheet.png`) kèm chuẩn hoá tỉ lệ bìa `7:10` (`D-031`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/cover-aspect-ratio.md

## Đang làm dở
- Trên nhánh `feat/miku-cursors` (tách sạch từ `origin/main` sau khi merge PR #11):
  1. **Sửa tràn tiêu đề modal (`ShelfBatchNoteModal.tsx`, `ShelfCoverPickerModal.tsx`, `ShelfAccessModal.tsx`):** thêm `min-w-0 flex-1` và `shrink-0` cho nút đóng `X`.
  2. **Chuẩn hoá tỉ lệ bìa `7:10` & tự động đồng bộ ngầm 1 lần (`D-031` — Worker đã deploy live):** bỏ crop cứng `480×720`, giữ nguyên tỉ lệ gốc ảnh bìa (`-v2.jpg`), đổi khung UI sang `aspect-[7/10]` và tự khôi phục ngầm toàn bộ bìa cũ khi Admin mở trang (`0` nút thừa, `0` đụng chạm `guest-packs`).
  3. **Bộ con trỏ chuột ĐỘNG 12 khung Hatsune Miku (`public/cursors/miku-sheet.png` `20.08 KB`, `src/lib/mikuCursorAnimator.ts`, `src/assets/cursors/*.png`, `src/index.css`):** phát đầy đủ chuyển động `.ani` gốc ở nhịp chuẩn `84ms`/khung (chớp mắt, bấm nút, quay hành, khóc `🚫`, ôm tim đập `💗` trên nút Yêu thích / Ủng hộ, cầm bút trên nút Sửa / Ghi chú, lấp lánh sao zoom ảnh...), tự dừng `0 FPS` khi ẩn tab hoặc `prefers-reduced-motion`, thu hồi sạch `URL.revokeObjectURL`.

## Bước tiếp theo
1. Mở Pull Request `feat/miku-cursors` vào `main` và bấm Merge khi CI xanh để đưa toàn bộ lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #11 (`feat/shelf-member-access`, `D-030`):** đã merge vào `main`.
- **`feat/web-2d-enhancements` (`D-029`)** & **PR #10 (`D-028`):** đã merge vào `main`.
