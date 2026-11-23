# HANDOFF
Cập nhật: 2026-11-23 22:30 | Nhánh: feat/catalog-alt-titles-ptr-anilist-collections | Build: 🟢 typecheck/lint/Worker tsc/build xanh (`index-*.js = 84.70 kB` gzip <= 86.04 kB)
Nhiệm vụ hiện tại: Hoàn tất toàn bộ **Wave 3** (`docs/plans/roadmap-v2-upgrades.md` & `D-036`: Phase 3.1 → 3.2 → 3.3 + *Đọc sau* theo tập lẻ), chạy migration `0013` D1 remote, deploy Worker và sẵn sàng mở PR Wave 3.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Không còn hạng mục code dở dang trong Wave 3.

## Bước tiếp theo
1. Mở và merge PR Wave 3 (`feat/catalog-alt-titles-ptr-anilist-collections` → `main`) sau khi CI xanh.
2. Triển khai **Wave 4** (`feat/discord-releases-and-comments`): Thông báo tự động tập mới lên kênh Discord (`QĐ-C`) & Bình luận/Cảm nhận cuối tập gắn danh tính Discord (`0014_book_comments.sql`).

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Wave 3 trọn vẹn (`feat/catalog-alt-titles-ptr-anilist-collections`, `D-036`):**
  - **Phase 3.1 (Worker + Migration `0013_catalog_enhancements.sql`):** thêm `shelf_prefs.alt_titles_json`, `user_plan_to_read` (cấp bộ), `user_plan_to_read_books` (cấp tập lẻ), `custom_collections` & `collection_shelves`; hợp nhất tự động khi đổi tên/gộp kệ; proxy `POST /api/admin/anilist/search` (`requireOwner`, timeout `6s`, 0 CDN).
  - **Phase 3.2 (Frontend Kho sách — Mục 9, 11, 12, 13 + *Đọc sau* cấp tập):** tìm kiếm khớp `alt_titles` + hiện trên `ShelfDetailHero`; nút *Đọc sau* cho cả Bộ truyện (`ShelfCoverCard`, `ShelfDetailHero`) lẫn từng Tập lẻ (`BookCard`, `EditorialBookStrip`, `ShelfDetailView`, `BookInfoModal`) + lọc `plan_to_read`; gợi ý AniList 1 chạm (`AniListSuggestPanel`); dải lọc & modal quản lý Tuyển tập (`CollectionFilterStrip`, `CollectionManagerModal`, lọc `D-030` cho `Guest`).
  - **Phase 3.3 (Tiện ích Thiết bị — Mục 18 & 19):** `CacheManagerModal` chỉ dành cho `Owner` (xoá lẻ/dọn sạch IndexedDB); PWA nâng cao (`manifest.webmanifest`, icons `192`/`512`/`maskable`/`apple-touch-icon`, `public/sw.js` tuân thủ chặt `QĐ-D` + `pwaRegister.ts`).
  - **Kiểm định & Triển khai:** E2E trình duyệt PC (`Owner`) & Mobile (`Guest`) xanh 100%, unit test `sw.js` 14/14, `index-*.js = 84.70 kB` gzip (`<= 86.04 kB`), đã chạy migration `0013` trên D1 remote & deploy Worker.
