# HANDOFF
Cập nhật: 2026-11-24 11:05 | Nhánh: fix/post-wave4-core-and-mobile | Build: 🟢 Worker tsc / eslint xanh
Nhiệm vụ hiện tại: Triển khai **PR 1** của kế hoạch `docs/plans/post-wave4-audit-fixes.md` (vá toàn bộ lỗi Backend + Trình đọc + Mobile iOS + 2D/PWA, tách riêng 3D sang PR 2; đã chốt `1A / 2A / 3A / 4A`, giữ nguyên `weeklyPopular` tính cả bộ `restricted`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã xong **Phase 1** (Backend Worker + migration `0015`).
- Còn lại trong PR 1: **Phase 2** (Lõi Reader, Sync & Parser EPUB/DOCX) → **Phase 3** (Reader UX, chéo theme & 2 lỗi Mobile iOS) → **Phase 4** (2D, Modals, Routing, PWA & CSS) → Kiểm định E2E & đồng bộ sổ sách (`D-038`).

## Bước tiếp theo
1. Triển khai Phase 2 (vá `pagehide keepalive`, `readingSeconds` IDB, race `ReaderSettings`, SVG XSS + `epub:type`, EPUB XHTML/DOCX parser).
2. Tiếp tục Phase 3 → Phase 4 → chạy migration `0015` local + kiểm thử trình duyệt PC/Mobile → cập nhật `docs/DECISIONS.md` & `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Phase 1 (`fix/post-wave4-core-and-mobile`):**
  - Fail-closed `D-030` tại `GET /api/books` & `GET /api/collections`; thống nhất `.normalize('NFC')` trong `toShelfAccessKey()` và toàn bộ đường ghi `shelf`.
  - Siết `D-028` (`QĐ-2: 2A`): không reset `rl_tokens`/`rl_strikes` khi đổi key Discord mới trong `auth.ts`, trừ nhẹ `0.2` token/ảnh cho `/api/guest/books/:id/media/:mediaIndex`, bật `trackStrikes` cho `/illustrations` & `/search`.
  - Dọn `book_highlights` khi xoá sách + `cleanupOrphanShelves` (`QĐ-4: 4A`) khi kệ còn 0 sách; xác thực kệ tồn tại trong `books` cho `communityDb`/`catalogEnhancementsDb`; thay SQLite `LOWER()` tiếng Việt ở `usageDb`/`usageQueries` bằng `toShelfAccessKey()`.
  - Nguyên tử hoá SQL chống race (`rateLimitDb`, `communityDb`, `progressDb`, `usageRecorder` + vá mốc 00:00 UTC+7 `last_reading_sync_at > 0`); vá `discordRelease.ts` (escape Markdown, `stripSeriesPrefix`, retry `429` + pacing); thêm migration `0015_audit_indexes_and_cleanup.sql` & cập nhật `schema.sql`.
