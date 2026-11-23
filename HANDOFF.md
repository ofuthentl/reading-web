# HANDOFF
Cập nhật: 2026-11-23 21:55 | Nhánh: feat/catalog-alt-titles-ptr-anilist-collections | Build: 🟢 typecheck/lint/Worker tsc/build xanh (`index-*.js = 84.95 kB` gzip <= 86.04 kB)
Nhiệm vụ hiện tại: Triển khai **Wave 3** (`docs/plans/roadmap-v2-upgrades.md` & `D-036`) — đang thực hiện **Phase 3.3 (Cache Manager Mục 18 & PWA Nâng cao Mục 19)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đang triển khai **Phase 3.3**: mở rộng `src/lib/cache.ts` + `CacheManagerModal.tsx` (`Owner`) và hoàn thiện `manifest.webmanifest`, `index.html`, `public/sw.js` (tuân thủ chặt `QĐ-D`) + `src/lib/pwaRegister.ts`.

## Bước tiếp theo
1. Hoàn tất Phase 3.3 (Mục 18 & Mục 19).
2. Chạy kiểm định tổng thể (`typecheck`, `lint`, `build`, `tsc --noEmit` Worker), chạy migration `0013` trên D1 local và kiểm thử E2E PC & Mobile ở cả 2 vai trò `Owner` & `Guest`.
3. Cập nhật `docs/ARCHITECTURE.md` + `HANDOFF.md`, chạy migration `0013` lên D1 remote, deploy Worker và push nhánh lên GitHub.

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Wave 3 · Phase 3.2 (Frontend Quản lý Kho sách — Mục 9, 11, 12, 13):**
  - Tích hợp `alt_titles` vào `libraryFiltering.ts` & `ShelfDetailHero.tsx`; thêm nút *Đọc sau* (`ShelfCoverCard`, `ShelfDetailHero`) và bộ lọc `plan_to_read` (`LibraryFilterBar`, `AdvancedSearchPanel`).
  - Tạo `AniListSuggestPanel.tsx` (0 CDN ảnh ngoài) gắn vào `ShelfBatchNoteModal` & `ShelfTagsModal` cùng tab chỉnh `Tên gọi khác`.
  - Tạo `CollectionFilterStrip.tsx` + `CollectionManagerModal.tsx` nạp lười trên Tab Thư viện; tách lười `Library3DHost` & `ActiveReaderHost` giữ `index-*.js = 84.95 kB` gzip.
- **Wave 3 · Phase 3.1:** Migration `0013_catalog_enhancements.sql`, CRUD APIs & proxy AniList trên Worker.
