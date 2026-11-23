# HANDOFF
Cập nhật: 2026-11-23 21:35 | Nhánh: feat/catalog-alt-titles-ptr-anilist-collections | Build: 🟢 Worker `tsc --noEmit` xanh
Nhiệm vụ hiện tại: Triển khai **Wave 3** (`docs/plans/roadmap-v2-upgrades.md` & `D-036`) — đang thực hiện **Phase 3.2 (Frontend Quản lý Kho sách)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đang triển khai **Phase 3.2** (Frontend Mục 9 `alt_titles`, Mục 11 Để dành đọc sau, Mục 12 Gợi ý AniList 1 chạm, Mục 13 Bộ sưu tập tuỳ chỉnh).

## Bước tiếp theo
1. Hoàn tất Phase 3.2: tích hợp `alt_titles` vào tìm kiếm & `ShelfDetailHero`, nút *Đọc sau* + lọc `plan_to_read`, nút *Gợi ý từ AniList* trong `ShelfBatchNoteModal` / `ShelfTagsModal`, dải Tuyển tập & `CollectionManagerModal`.
2. Triển khai Phase 3.3: nâng cấp `src/lib/cache.ts` + `CacheManagerModal.tsx` (`Owner`) và PWA nâng cao (`manifest.webmanifest`, `public/sw.js` tuân thủ `QĐ-D`, `src/lib/pwaRegister.ts`).
3. Kiểm định tổng thể (`typecheck`, `lint`, `build`, D1 local + trình duyệt PC/Mobile Owner & Guest), cập nhật `ARCHITECTURE.md`, chạy migration `0013` remote, deploy Worker & push nhánh.

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Wave 3 · Phase 3.1 (Backend Worker + Migration `0013_catalog_enhancements.sql`):**
  - Thêm cột `alt_titles_json` vào `shelf_prefs`, tạo bảng `user_plan_to_read`, `custom_collections` & `collection_shelves` kèm đồng bộ `schema.sql`.
  - Mở rộng `GET /api/books` trả `shelfAltTitles`, `planToReadShelves` (cách ly `user_scope`) & `collections` (tự lọc bỏ kệ `restricted` không được cấp quyền cho `guest` theo `D-030`).
  - Thêm `PUT /api/shelves/alt-titles`, `PUT /api/plan-to-read`, CRUD `/api/collections`, hợp nhất tự động khi `POST /api/shelves/rename` và `POST /api/admin/anilist/search` (`6s` timeout, làm sạch HTML, map 40 tag chuẩn).
- **Wave 1 (PR #21)** & **Wave 2 (PR #22)** đã merge vào `origin/main`.
