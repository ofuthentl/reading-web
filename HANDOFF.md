# HANDOFF
Cập nhật: 2026-11-24 11:23 | Nhánh: fix/post-wave4-core-and-mobile | Build: 🟢 typecheck / lint xanh
Nhiệm vụ hiện tại: Triển khai **PR 1** của kế hoạch `docs/plans/post-wave4-audit-fixes.md` (vá toàn bộ lỗi Backend + Trình đọc + Mobile iOS + 2D/PWA, tách riêng 3D sang PR 2; đã chốt `1A / 2A / 3A / 4A`, giữ nguyên `weeklyPopular` tính cả bộ `restricted`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã xong **Phase 1** (Backend Worker + migration `0015`), **Phase 2** (Lõi Reader, Sync & Parser EPUB/DOCX) và **Phase 3** (Reader UX, tương phản chéo theme `3A` & 2 lỗi Mobile iOS).
- Còn lại trong PR 1: **Phase 4** (2D UI, Modals, Routing, State Sync, Upload Wave 4, PWA & CSS) → Kiểm định build/E2E & đồng bộ sổ sách (`D-038`).

## Bước tiếp theo
1. Triển khai **Phase 4**: sửa `AdminProtectionModal` finally, `ToastContainer` portal `z-[90]`, `ReadingStatsModal` + `QuoteVaultModal` layering & nhảy vị trí, `useBodyScrollLock`, routing `/locked`/`/usage`, `CacheManagerModal` Local Dev, `UploadDropzone`/`shelfPlacement`, state sync & `legacyCoverSync`, `AdminUsageView`/`Library2DView`, `sw.js`, Tailwind v3, `mikuCursorAnimator`, tách `src/index.css`.
2. Chạy `typecheck`, `lint`, `build` (kiểm trần `index-*.js <= 86.04 kB` gzip), migration `0015` local + kiểm thử trình duyệt PC/Mobile → cập nhật `docs/DECISIONS.md` & `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Phase 3 (`fix/post-wave4-core-and-mobile`):**
  - Tương phản chéo theme (`3A`): mở rộng `ReaderThemePalette` và áp 100% token reader cho nút `Tới ↗` Tab Minh họa, `CommunityReviewsSection`/`Item`, `ReaderSettingsPopover`, `ReaderHighlightPopover`, `ReaderFootnotePopover`, `ReaderTopBar`, `ReaderTocDrawer`, `ReaderSearchAndBookmarks`, `ReaderHighlightsPanel`, `ReaderChapterEndNav` & `ReaderPaginatedFooter`.
  - 2 lỗi Mobile iOS: lật `ReaderHighlightPopover`/`ReaderFootnotePopover` lên đỉnh khi bôi/chạm nửa dưới + `select-none` + nâng `ReaderNightDimOverlay` lên `z-[63]`; tách `ReaderPaginatedFooter` 1 hàng cân đối `flex-nowrap` trên mobile (`< Trước | 18/143 · Ch.9/13 | Sau >`).
  - Ổn định Paginated/Scroll & tiện ích: vá `#anchor` trong paginated, chờ ảnh settle trước khi mark completed, diệt `ResizeObserver` thrashing khi ẩn/hiện toolbar, chặn swipe khi pinch/select, bảo toàn `scrollRatio` khi đổi cỡ chữ/resize, hỗ trợ `<svg><image>` Lightbox, vạch highlight canvas an toàn biên trái, giới hạn 3 thumbnail Guest song song + nhân bản `ImageBitmap`, ẩn tiêu đề chương & khoá `Tới` khi che spoiler, cho phép Guest copy/cut trong input bình luận, đồng bộ xoá & mở đúng vị trí từ `QuoteVaultModal`, chuẩn hoá `domHighlights`/`readerSearchJump`/`epubFootnotes` & `AbortSignal`.
- **Phase 1–2:** Backend Worker (`D-030` fail-closed/NFC, `D-028` `2A`, `cleanupOrphanShelves` `4A`, race SQL, `discordRelease`, migration `0015`) & Lõi Reader/Parser (`keepalive`, `ReaderSettings` race, IndexedDB, SVG XSS, EPUB/DOCX).
