# HANDOFF
Cập nhật: 2026-11-24 22:31 | Nhánh: feat/v4-spine-shelf-and-catalog | Build: 🟢 typecheck / lint / Worker tsc xanh
Nhiệm vụ hiện tại: **Triển khai nâng cấp v4 (8 hạng mục: A1, A2, C12 chỉ độ đậm chữ, C13, D15 bỏ Tạm ngưng, D16, D18, D19 Khoá Tập/Chương)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Chuẩn bị triển khai **Phase 3 — Trình đọc (`C12` Độ đậm chữ, `C13` Tự học WPM + Nhắc nghỉ mắt & UI Khoá chương `D19`)**.

## Xong trong nhánh này
1. **Phase 1 — Backend Worker, Migration `0018` & Bảo mật 3 tầng (`Bộ → Tập → Chương`):**
   - Hoàn tất migration `0018`, chấm nửa sao `0.5..5.0`, `rereadCount`, whitelist `fontWeight` + `eyeBreakMinutes`, liên kết `shelf_relations` và phân quyền 3 tầng `Bộ → Tập → Chương` (`0 B` re-pack R2).
2. **Phase 2 — Giao diện Thị giác (`A1` Tủ Gáy Sách 2D & `A2` Hiệu ứng Ánh Kim):**
   - `src/styles/bookshelf.css`, `SpineBookshelfSlot.tsx`, `SpineBookshelfView.tsx`, `LibraryCatalogView.tsx`: hộp sách cứng 90° chuẩn Light Novel Nhật (gáy phải, bìa `7:10` mở sang trái, cạnh giấy trái), Single Active Owner + hover-intent `40ms`, chia hàng động `ResizeObserver`, 4 chế độ nền, cảm ứng 2 chạm & nút `Mở kệ →` (mặc định giữ `Lưới Bìa` theo `4A`, nạp lười `0 B` entry).
   - `src/styles/effects.css`, `ShelfCoverCard.tsx`, `BookCard.tsx`: lớp ánh kim `.cover-foil-card` tái sử dụng `--gx`/`--gy`/`--glare-opacity` (`0` JS mới).

## Bước tiếp theo
1. Phase 3: Độ đậm chữ (`C12`), tự học WPM + nhắc nghỉ mắt (`C13`) & UI khoá chương trong trình đọc Guest (`D19`).
2. Phase 4: UI nửa sao + Đọc lại (`D15`), gợi ý Cùng gu + Liên kết (`D16`), Xuất Markdown + Sức khoẻ kho sách (`D18`), và Modal Admin khoá Tập/Chương (`D19`).
3. Kiểm thử tích hợp Worker + D1 cục bộ, trình duyệt thật Desktop/Mobile và cập nhật `DECISIONS.md` (`D-042`) + `ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc ngoài Git.
