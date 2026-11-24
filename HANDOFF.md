# HANDOFF
Cập nhật: 2026-11-24 23:42 | Nhánh: feat/v4-spine-shelf-and-catalog | Build: 🟢 XANH (`index-*.js = 84.79 kB` gzip <= `86.04 kB`)
Nhiệm vụ hiện tại: **Hoàn tất trọn bộ nâng cấp v4 (8 hạng mục: A1, A2, C12 chỉ độ đậm chữ, C13, D15 bỏ Tạm ngưng, D16, D18, D19 Khoá Tập/Chương — `D-042`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Không có — toàn bộ 4 Phase, kiểm thử tích hợp Worker + D1 cục bộ (9/9 chặng), trình duyệt thật Desktop/Mobile (`Owner` + `Guest`, `0` lỗi Console/Page) và tài liệu `D-042` đã hoàn tất 100%, sẵn sàng mở PR sang `main`.

## Xong trong nhánh này
1. **Phase 1 — Backend Worker & Migration `0018_v4_catalog_ratings_and_access.sql`:**
   - Chấm nửa sao `0.5..5.0` (`rating_half` tương thích ngược), `reread_count` bảo toàn `reading_seconds`, whitelist `fontWeight` + `eyeBreakMinutes`, liên kết `shelf_relations` (ẩn sạch với `guest` khi chạm bộ khoá theo `D-030`) và phân quyền 3 tầng `Bộ → Tập → Chương` (`0 B` re-pack R2, gộp mảnh `-pN`, chặn cứng `403` trên TOC/chapter/media độc quyền/bookmarks/highlights, loại khỏi `search`/`illustrations`).
2. **Phase 2 — Thị giác Kho sách (`A1` Tủ Gáy Sách 2D & `A2` Hiệu ứng Ánh Kim):**
   - `SpineBookshelfView` nạp lười (`preserve-3d` bản lề gáy bên **PHẢI** mở 90° sang **TRÁI** chuẩn Light Novel Nhật, `ResizeObserver`, hover-intent `40ms`, cảm ứng 2 chạm Mobile, 4 nền) & `.cover-foil-card` tái sử dụng `--gx`/`--gy`.
3. **Phase 3 — Trình đọc (`C12` Độ đậm chữ, `C13` Tự học WPM + Nhắc nghỉ mắt & UI Chương khoá):**
   - Độ đậm chữ `Thường` · `Vừa` · `Đậm` trên cả DOM & `<canvas>`, tự học WPM bằng EMA (`120..450` + nút `Đặt lại 220`), nhắc nghỉ mắt `30/45/60p` (tự reset khi ẩn tab `>= 2p`) & màn hình `GuestLockedChapterCard`.
4. **Phase 4 — Cộng đồng, Hệ sinh thái Kho sách & Quản trị (`D15`, `D16`, `D18`, `D19`):**
   - `HalfStarRatingControl` + Đọc lại `↻ ×N` (không thêm Tạm ngưng), *Cùng vũ trụ & Liên kết* 2 chiều + *Cùng gu trong kho* (`0` query D1), xuất `.md` trích dẫn riêng cho `Owner` + `AdminLibraryHealthModal` (`LibraryHeader` & `Ctrl+K`), và `BookAccessModal` phân quyền Tập/Chương.

## Bước tiếp theo (Khi deploy lên Production)
1. Push nhánh `feat/v4-spine-shelf-and-catalog` và tạo Pull Request vào `main` (chờ CI xanh).
2. Khi deploy Worker lên Cloudflare Production: chạy migration D1 từ xa **trước hoặc ngay cùng lúc** deploy Worker:
   - `cd workers/r2-storage && npx wrangler d1 execute library-db --remote --file=./migrations/0018_v4_catalog_ratings_and_access.sql && npx wrangler deploy`
   *(Worker cũng đã có cơ chế tự `CREATE TABLE IF NOT EXISTS` / auto-`ALTER` dự phòng an toàn).*

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ngoài Git ở thư mục gốc.
