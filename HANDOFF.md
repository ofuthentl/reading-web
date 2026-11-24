# HANDOFF
Cập nhật: 2026-11-24 22:26 | Nhánh: feat/v4-spine-shelf-and-catalog | Build: 🟢 typecheck / lint / Worker tsc xanh
Nhiệm vụ hiện tại: **Triển khai nâng cấp v4 (8 hạng mục: A1, A2, C12 chỉ độ đậm chữ, C13, D15 bỏ Tạm ngưng, D16, D18, D19 Khoá Tập/Chương)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Chuẩn bị triển khai **Phase 2 — Tủ Gáy Sách 2D (`A1`) & Hiệu ứng Ánh Kim (`A2`)**.

## Xong trong nhánh này
1. **Phase 1 — Backend Worker, Migration `0018` & Bảo mật 3 tầng (`Bộ → Tập → Chương`):**
   - `migrations/0018_v4_catalog_ratings_and_access.sql` & `schema.sql`: thêm `library_ratings.rating_half`, `reading_progress.reread_count`, `guest_reading_progress.reread_count`, `shelf_relations` và 4 bảng phân quyền `book_access_rules`, `book_guest_grants`, `chapter_access_rules`, `chapter_guest_grants` kèm auto-`ALTER` / `CREATE TABLE IF NOT EXISTS` dự phòng.
   - `communityRatingsDb.ts`, `progressDb.ts`, `readerPrefsDb.ts`, `shelfRelationsDb.ts`: chấm nửa sao `0.5..5.0` tương thích ngược, đếm `rereadCount` bảo toàn `reading_seconds`, whitelist `fontWeight` + `eyeBreakMinutes`, CRUD liên kết bộ cùng vũ trụ (tự gộp khi rename, ẩn liên kết bộ khoá với Guest).
   - `bookChapterAccessDb.ts`, `bookChapterAccessAdminDb.ts`, `guestAdminDb.ts`, `guestPack.ts`, `guestIllustrations.ts`, `guestSearch.ts`, `bookmarksDb.ts`, `highlightsDb.ts`, `booksDb.ts`: khoá 3 tầng chuẩn hoá `toCanonicalChapterKey` (`-pN`), chặn cứng `403` trên chương/ảnh/bookmark/highlight khoá và lọc khỏi `search`/`illustrations` với `0 B` re-pack R2.

## Bước tiếp theo
1. Phase 2: Tạo `src/styles/bookshelf.css`, `src/styles/effects.css`, `SpineBookshelfSlot.tsx`, `SpineBookshelfView.tsx` và nối vào `LibraryCatalogView`, `ShelfCoverCard`, `BookCard`.
2. Phase 3: Độ đậm chữ (`C12`), tự học WPM + nhắc nghỉ mắt (`C13`) & UI khoá chương cho Guest (`D19`).
3. Phase 4: UI nửa sao + Đọc lại (`D15`), gợi ý Cùng gu + Liên kết (`D16`), Xuất Markdown + Sức khoẻ kho sách (`D18`), và Modal Admin khoá Tập/Chương (`D19`).
4. Kiểm thử tích hợp Worker + D1 cục bộ, trình duyệt thật Desktop/Mobile và cập nhật `DECISIONS.md` (`D-042`) + `ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc ngoài Git.
