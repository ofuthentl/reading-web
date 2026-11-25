# HANDOFF
Cập nhật: 2026-11-25 15:22 | Nhánh: fix/v5-wave1-mobile-audit-and-bundle | Build: 🟢 XANH (`index-*.js = 76.00 kB` gzip `<< 86.04 kB`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 1 (`D-046` — chốt `1A`, `2A`, `3A`, `4A`, `5A`, bỏ qua mục macOS NFD)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Đã hoàn tất & kiểm chứng xanh **Wave 1 — Phase 1.1, Phase 1.2 và Phase 1.3** (`typecheck`, `lint` 0/0, mọi tệp `<= 500` dòng, `build` xanh, assertions Phase 1.3 pass 100%). Sẵn sàng sang **Phase 1.4** (Cloudflare Worker) trên cùng nhánh.

## Xong trong nhánh này
### Phase 1.1 — Vá 2 lỗi iPhone & RAM/Cache Mobile (`QĐ-2A`, `QĐ-3A`)
- Đổi `<header>` (`LibraryHeader`, `AdminUsageView`) sang `fixed inset-x-0 top-0` + spacer `ResizeObserver`, dời `overflow-x-clip` xuống `<main>`, bỏ `backdrop-blur` nặng trên mobile/badge tối, tách `LibraryMobileOwnerMenu.tsx`.
- Giải nén spine EPUB theo lô `4` tệp/lô, sửa `parseAndSanitizeEpubBody` sang HTML5 fragment serializer + null-guard `<frameset>`, hạ concurrency ảnh mobile xuống `2` + thu hồi `ObjectURL` chương xa, kiểm tra chữ ký ZIP `PK` + LRU di động `<= 6` sách / `<= 250 MiB` + `inFlightBookFetches`, tách nạp lười `LazyLibrary2DView`.

### Phase 1.2 — Vá lỗi Trình đọc, Guest Canvas, Owner Lazy Media, Soundscapes & Tủ Gáy Sách
- Đồng bộ `GuestCanvasReader`/`useGuestChapterStream`/`useGuestCanvasViewport`/`GuestCanvasPaginatedView` bỏ trễ 1 nhịp & đồng bộ lại `imageSizes` sau rAF hủy; sửa deadlock `scheduleThumbFetch` (`ReaderIllustrationThumbs.tsx` mới) + unmount clone + Lightbox `<StrictMode>`.
- Vá 4 tương tác Owner Lazy Media (`LAZY_MEDIA_PLACEHOLDER_SRC`), dọn `guestIllustrationsCache` khi logout/đổi phiên, phím tắt `M`/`B`/`F` đóng lại drawer, bỏ gửi đúp `PUT /progress` ở `restartBookReread`, reset `usePullToNextChapter` + tránh mép trái `24px`, `readerSoundscapes` iOS Safari + `cancelAndHoldAtTime`, `fontWeight` footnotes, `safeDecodeUri`, DOCX table `noteRefs`, bỏ backdrop `ReaderHighlightPopover`, chặn race `fetchRemoteReaderSettings`, 2-tap `SpineBookshelfSlot` & breakpoint `640px`.

### Phase 1.3 — Vá Upload Song song, Metadata `D-044`, Store & UI Thư viện
1. **Upload song song & cảnh báo rõ (`bookUploadClient.ts` mới, `apiAdminMutations`, `guestPackBuilder`, `uploadBatchHelpers`, `UploadDropzone`, `UploadQueueList`, `useLibraryDataStore`):**
   - Merge `storage` đơn điệu (`mergeUploadStorageStats`) + đồng bộ lại `GET /api/storage` sau lô nhiều cuốn; huỷ ngay `buildGuestPackEnvelope` bằng `AbortController` khi `PUT /file` lỗi; không nuốt `ApiAuthError (401)` hay `413` ở `PUT /cover` & `PUT /guest-pack` và hiện cảnh báo vàng rõ trên hàng đợi + toast thay vì đánh dấu xanh.
   - Serialize nhẹ các cuốn thuộc cùng bộ mới chưa có trên kệ & tập lẻ chưa rõ tác giả trên tên file (kèm gom lại kệ sau khi trích `<dc:creator>`); cập nhật copy khỏi `"Tải tuần tự từng cuốn"`.
2. **Chống tải trùng (`UploadDropzone`, `uploadBatchHelpers`, `seriesShelfExtractor`):** tái sử dụng `buildLibraryDuplicateKeys` và kiểm tra thêm `normalizeBookTitleDuplicateKey` (khớp NFC kể cả sách D1 đã đổi tác giả qua `<dc:creator>`/AniList/sửa tay).
3. **Heuristics metadata `D-044` (`authorHeuristics`, `seriesShelfExtractor`, `bookMetadata`, `shelfPlacement`, `shelfSummary`, `shelfBatchHelpers`):**
   - Tách rạch ròi `isReleaseMetadataNoise` (`[Hako]`, `Sonako`, `Calibre`, `Full`, URL...) khỏi phụ đề tập hợp lệ (`?!…:`, chữ số, `after the end`...); sửa `getHealedTitleInShelf`/`isUniqueSubtitleInShelf` tuyệt đối không nối rác hay tên tác giả thật vào `book.title`; bảo toàn đồng tác giả `"A"` + `"A, B"`; sửa fallback `'kho chưa phân loại'` ở `buildShelfAuthorContext`; chặn cắt nhầm `"Man I"` / `"Book a"` ở `VOL_STD_UNIT`.
4. **Store, lọc Thư viện & Modal UI (`useLibraryViewState`, `legacyCoverSync`, `useLibraryDataStore`, `useLibraryUserActions`, `shelfPrefs`, `libraryStoreHelpers`, `BookInfoModal`, `App`, `nextVolume`, `ShelfDetailView`, `commandPaletteSearch`, `quoteMarkdownExport`, `readingStats`, `AuthGate`, `AniListSuggestPanel`, `CollectionManagerModal`, `AdminProtectionModal`, `AdminUsageGuestTable`, `ReadingStatsModal`, `CommandPaletteModal`, `QuoteVaultModal`):**
   - Chặn `activeCollectionId` rò rỉ sang Trang chủ; `legacyCoverSync` bỏ qua `cover_key === null`; dọn sạch `collections`, `planToReadShelfKeys`, `shelfPrefs` (và `clearLocalShelfPrefs` khi logout); `progressRef` + version guard trong `useLibraryUserActions`; `.normalize('NFC')` tại `BookInfoModal`/`App`/`nextVolume`; bỏ `setActiveTab('home')` thừa ở `onSelectAuthor`; reset `onlyPtrVolumes` tức thì theo `shelf.key` & nút xem đủ tập; sort `matchedQuotes` theo `score`; revoke Markdown `45_000ms`; thêm abort/mounted guard & không nuốt `401` trên toàn bộ modal/AuthGate; bỏ `hp`/`mana` 3D chết & đổi `"Chế độ 2D"` ở `AuthGate` (còn chuỗi tương tự ở `workers/r2-storage/src/discord.ts:243` xử lý ở Phase 1.4).

## Bước tiếp theo
1. Tiếp tục **Wave 1 — Phase 1.4** (Cloudflare Worker fixes + sửa chuỗi `chế độ đọc 2D` ở `discord.ts`) trên cùng nhánh `fix/v5-wave1-mobile-audit-and-bundle`.
2. Sau đó chạy **Phase 1.5** (`AuthenticatedLibraryShell`, PWA `SKIP_WAITING`, Auto-Test CI, Deploy Worker & PR Wave 1).
3. Sau khi Wave 1 merge vào `main`, tách nhánh cho **Wave 2** rồi **Wave 3**.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
