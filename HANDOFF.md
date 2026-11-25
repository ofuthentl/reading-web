# HANDOFF
Cập nhật: 2026-11-25 14:52 | Nhánh: fix/v5-wave1-mobile-audit-and-bundle | Build: 🟢 XANH (`index-*.js = 75.06 kB` gzip `<< 86.04 kB`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 1 (`D-046` — chốt `1A`, `2A`, `3A`, `4A`, `5A`, bỏ qua mục macOS NFD)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Đã hoàn tất & kiểm chứng xanh **Wave 1 — Phase 1.1** và **Phase 1.2** (`typecheck`, `lint` 0/0, mọi tệp `<= 500` dòng, `build` xanh). Sẵn sàng sang **Phase 1.3** trên cùng nhánh.

## Xong trong nhánh này
### Phase 1.1 — Vá 2 lỗi iPhone & RAM/Cache Mobile (`QĐ-2A`, `QĐ-3A`)
- Đổi `<header>` (`LibraryHeader`, `AdminUsageView`) sang `fixed inset-x-0 top-0` + spacer `ResizeObserver`, dời `overflow-x-clip` xuống `<main>`, bỏ `backdrop-blur` nặng trên mobile/badge tối, tách `LibraryMobileOwnerMenu.tsx`.
- Giải nén spine EPUB theo lô `4` tệp/lô, sửa `parseAndSanitizeEpubBody` sang HTML5 fragment serializer + null-guard `<frameset>`, hạ concurrency ảnh mobile xuống `2` + thu hồi `ObjectURL` chương xa, thêm kiểm tra chữ ký ZIP `PK` + LRU di động `<= 6` sách / `<= 250 MiB` + `inFlightBookFetches`, tách nạp lười `LazyLibrary2DView`.

### Phase 1.2 — Vá lỗi Trình đọc, Guest Canvas, Owner Lazy Media, Soundscapes & Tủ Gáy Sách
1. **Guest Canvas sync (`GuestCanvasReader`, `useGuestCanvasViewport`, `GuestCanvasPaginatedView`, `useGuestChapterStream`):** bỏ trễ 1 nhịp `activeStreamIdx` & khóa theo `streamState.key` + `chapterData.id === expectedChapterId` trước khi tiêu thụ `searchTarget.nonce`, `restoreTargetRatioRef` và tự đánh dấu `completed` ở chương cuối; đồng bộ lại `imageSizes` khi quay lại chương có sẵn `ImageBitmap` sau rAF bị hủy.
2. **Phòng tranh & Lightbox (`ReaderIllustrationGallery`, `ReaderIllustrationThumbs` mới, `ReaderImageLightbox`):** sửa deadlock hàng đợi `scheduleThumbFetch` (`queuedEntry` + `drainThumbFetchQueue`), kiểm tra unmount sau `createImageBitmap`, và trì hoãn đóng `ownedBitmap` qua microtask để không vỡ dưới `<StrictMode>`.
3. **Owner Lazy Media (`ReaderView`, `ReaderPaginatedView`, `useDomReadingRuler`, `readerConfig`):** chặn `imagesSettled`/`completed` sớm, hoãn nhảy Tìm chữ & khôi phục cuộn dấu trang khi còn `LAZY_MEDIA_PLACEHOLDER_SRC`, gắn lại `.reader-ruler-focus` theo `contentKey` (`mediaRev`), và bỏ qua GIF 1×1 trong `findClickedReaderImage`.
4. **Dọn cache Phòng tranh (`guestCrypto`, `App`):** export `clearGuestIllustrationsCache()` + bảo vệ theo token phiên và gọi qua dynamic import khi đăng xuất / đổi phiên / `401`.
5. **Phím tắt, Đọc lại, Cử chỉ, Âm thanh & Parser (`useReaderController`, `useReaderChapterProgress`, `useReaderScrollGestures`, `readerSoundscapes`, `epubFootnotes`, `epubSummaryExtractor`, `docxParser`, `ReaderHighlightPopover`, `useBookReader`):**
   - Cho `M`/`B`/`F` đóng lại ngăn kéo/cài đặt (`data-reader-chrome-dialog`); giữ `minSec = 5` ở debounced scroll save tránh thất thoát `reading_seconds`.
   - Bỏ gửi đúp `PUT /api/progress` ở `restartBookReread` (`skipSave`); `fallbackProgress` dùng `completedRef.current`.
   - Reset `usePullToNextChapter` theo `chapterKey` và bỏ qua vuốt mép trái `clientX <= 24`; kiểm tra `ctx.state === 'running'` sau `ctx.resume()` trên iOS Safari + dùng `cancelAndHoldAtTime`.
   - Truyền `fontWeight` vào `findCanvasFootnoteAtPoint`; bọc `safeDecodeUri` ở `epubSummaryExtractor`; truyền `noteRefs` trong bảng DOCX; bỏ backdrop `fixed inset-0` ở `ReaderHighlightPopover`; chặn race `fetchRemoteReaderSettings` bằng `localSettingsVersionRef`.
6. **Tủ Gáy Sách 2D (`SpineBookshelfSlot`, `SpineBookshelfView`):** phân biệt `focus` do touch với keyboard giữ đúng 2-tap trên Android/Chromium và đồng bộ `COMPACT_BREAKPOINT_PX = 640` với CSS.

## Bước tiếp theo
1. Tiếp tục **Wave 1 — Phase 1.3** (Upload song song, Metadata `D-044`, Store & UI Thư viện) trên cùng nhánh `fix/v5-wave1-mobile-audit-and-bundle`.
2. Sau đó chạy **Phase 1.4** (Cloudflare Worker) → **Phase 1.5** (`AuthenticatedLibraryShell`, PWA `SKIP_WAITING`, Auto-Test CI, Deploy Worker & PR Wave 1).
3. Sau khi Wave 1 merge vào `main`, tách nhánh cho **Wave 2** rồi **Wave 3**.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
