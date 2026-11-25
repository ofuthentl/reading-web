# Kế hoạch tổng thể — Đợt Vá Lỗi Toàn Diện & Nâng Cấp Ofu's Library v5

- **Ngày lập:** 2026-11-25
- **Nhánh khởi đầu (Wave 1):** `fix/v5-wave1-mobile-audit-and-bundle` *(tách sạch từ `origin/main` sau PR #35 `D-045`)*
- **Phạm vi bao gồm:**
  - **2 lỗi quay thực tế trên iPhone:** (1) Văng trình duyệt do tràn RAM / lỗi cache IndexedDB ở tab chính khi mở sách; (2) Rung giật & lộ khe chữ phía trên `<header>` khi cuộn trên iOS WebKit.
  - **Toàn bộ lỗi tồn đọng mức Cao, Trung bình và Nhỏ đã xác minh** trên Frontend & Cloudflare Worker *(đã loại bỏ mục 1.2 đường dẫn ảnh NFD máy Mac theo yêu cầu người dùng)*.
  - **Toàn bộ 13 nâng cấp đã thống nhất** chia làm 3 nhóm: Hạ tầng/Tốc độ/Kiểm thử, Quản trị kho sách ~260+ tập, và Trải nghiệm Đọc/Bảo mật/Cộng đồng Discord.
- **Ràng buộc bất biến (`AGENTS.md` & `DECISIONS.md`):**
  - Chi phí vận hành **\$0** trên Cloudflare Free Tier (tôn trọng trần `10ms` CPU, `50` subrequest/invocation, `100` bind params D1), **0 CDN ngoài**, giữ nguyên trần cứng **9.0 GiB R2** (`D-002`).
  - Hạ entry `index-*.js` từ `85.92 kB` xuống **`~55–60 kB` gzip** (`<< 86.04 kB` của `D-013`).
  - Bảo toàn tuyệt đối chống cào 4 lớp `D-028`, phân quyền 3 tầng `D-030`/`D-042` và tàng hình `/usage` `D-035`.
  - Mọi tệp mã nguồn `<= 500` dòng (ESLint `max-lines`), mọi `URL.createObjectURL` có `URL.revokeObjectURL`, không lưu dữ liệu lớn vào `localStorage`.

---

## 1. Các quyết định kiến trúc cần chốt trước khi code (`AGENTS.md` §4)

### QĐ-1: Chiến lược chia nhánh & PR triển khai
- **Phương án 1A (Khuyến nghị — Chia 3 Wave / 3 PR nối tiếp độc lập):**
  - **Wave 1 (`fix/v5-wave1-mobile-audit-and-bundle` — 0 migration D1):** Vá 2 lỗi iPhone + toàn bộ lỗi tồn đọng mức Cao/Trung bình/Nhỏ (FE + Worker) + giải phóng ~25–30 kB entry bundle & CSS mobile + PWA `SKIP_WAITING` + bộ test tự động & cổng CI + đồng bộ tài liệu. Đưa lên `ofu.lol` sớm nhất để hết ngay crash & rung header.
  - **Wave 2 (`feat/v5-wave2-admin-storage-and-catalog` — 0 migration D1):** Thay tệp EPUB/DOCX tại chỗ giữ tiến độ/bình luận/quyền, Đối soát & Dọn rác R2 thật, Đồng bộ gói khách theo từng bộ/tập + mở đủ bảng *Sức khoẻ kho sách*, Sao lưu/Khôi phục JSON Owner, và tối ưu `GET /api/books` bằng ETag/`304`.
  - **Wave 3 (`feat/v5-wave3-reader-ux-security-discord` — 1 migration cộng thêm `0019`):** Tải trước ngầm chương kế tiếp cho Guest (~80%), Thanh tua nhanh + Bảng phím tắt `?` + `<ModalShell>` thống nhất, Phân trang/nạp dần lưới Trang chủ, Security Headers + CSP + Nút *Đăng xuất mọi thiết bị Admin* (`owner_min_iat`), và Nhóm quyền Discord Presets + Góc quản lý Bình luận mới nhất `/usage` + Cảnh báo webhook Admin tuỳ chọn.
  - *Rủi ro / Hoàn tác:* Rất thấp; mỗi Wave có thể test, deploy và `git revert` hoàn toàn độc lập.
  - *Điểm yếu:* Cần duyệt & merge 3 PR tuần tự (và deploy Worker ở các Wave có đụng backend) thay vì 1 lần duy nhất.
- **Phương án 1B (Chia 2 PR — PR 1 toàn bộ vá lỗi + hạ tầng, PR 2 toàn bộ 10 tính năng mới):**
  - *Điểm yếu:* PR 2 vẫn quá đồ sộ (~60+ file cả FE + Worker + migration), khó review và dễ phát sinh lỗi chéo.
- **Phương án 1C (Gộp tất cả vào 1 PR duy nhất):**
  - *Điểm yếu:* Diff khổng lồ >100 file, lỗi văng trang & rung header trên iPhone phải chờ toàn bộ 13 tính năng xong mới được vá lên `ofu.lol`.

### QĐ-2: Cách xử lý dứt điểm lỗi rung/hở khe `<header>` trên iPhone (Video #1)
- **Phương án 2A (Khuyến nghị — `fixed inset-x-0 top-0` + đệm chiều cao đồng bộ + bỏ `backdrop-blur` nặng trên mobile & badge bìa):**
  - Đổi `<header>` của `LibraryHeader` và `AdminUsageView` sang `fixed inset-x-0 top-0`, dời `overflow-x-clip` xuống riêng `<main>`, dùng nền đặc mịn `bg-surface` ở `< md` (giữ kính mờ trên desktop `md:bg-surface/95 md:backdrop-blur-sm`) và bỏ `backdrop-blur-sm` thừa trên các badge nền tối `bg-[#111113]/85` của `ShelfCoverCard`.
  - *Rủi ro / Hoàn tác:* Thấp; dễ hoàn tác trong 2 file UI.
  - *Điểm yếu:* Cần 1 spacer khớp chính xác chiều cao header giữa mobile (có hàng 3 tab) và desktop (1 hàng) — dùng CSS chiều cao chuẩn kèm `ResizeObserver` gọn ~10 dòng để tránh nhảy layout.
- **Phương án 2B (Giữ `sticky top-0`, chỉ tách `overflow-x-clip`/`isolation` khỏi cha và tắt `backdrop-blur` trên mobile):**
  - *Điểm yếu:* Trên iOS WebKit khi thanh địa chỉ co/giãn nhanh, `sticky` đôi khi vẫn có độ trễ ~1 frame (giảm 80–90% nhưng không ghim cứng tuyệt đối bằng `fixed`).

### QĐ-3: Cách chặn dứt điểm lỗi văng RAM / hỏng cache IndexedDB ở tab chính trên iPhone (Video #2)
- **Phương án 3A (Khuyến nghị — Cắt đỉnh RAM lúc mở sách + Giới hạn LRU cache sách trên di động + Tự phục hồi `Blob` IDB lỗi + Mở nút *Bộ nhớ đệm* trên mobile):**
  - Trong `parsers.ts`: thay `Promise.all` giải nén 100% spine XHTML cùng lúc bằng giải nén theo **lô nhỏ `4` tệp/lô** và xả chuỗi gốc ngay sau khi parse từng chương.
  - Trong `zipMediaCache.ts`: hạ bung ảnh song song xuống `2` trên thiết bị cảm ứng/mobile (`6` trên desktop) và giữ ảnh đã giải nén tối đa `3` chương gần chương hiện tại trên di động (tự `URL.revokeObjectURL` các chương xa, quay lại thì bung lại từ ZIP trong vài ms).
  - Trong `cache.ts` + `api.ts`: trên di động/cảm ứng tự giới hạn LRU tối đa **`6` cuốn sách gần nhất (hoặc `<= 250 MB`)** trong `book_blobs` để IndexedDB không phình hàng GB trên iPhone; kiểm tra tính hợp lệ của `Blob` đọc từ IndexedDB (`size > 0` và thử đọc header `PK`), nếu lỗi tự xoá mục hỏng & tải sạch lại từ R2 không làm văng trình duyệt.
  - Trong `LibraryHeader.tsx`: thêm nút menu gọn (`⋯`) trên mobile cho Owner mở nhanh *Bộ nhớ đệm*, *Sức khoẻ kho sách* và *Bảo mật* ngay trên điện thoại.
  - *Rủi ro / Hoàn tác:* Thấp; tương thích ngược 100% với IndexedDB sẵn có.
  - *Điểm yếu:* Trên điện thoại chỉ giữ cache mở tức thì `0ms` cho ~6 cuốn gần nhất (cuốn thứ 7 cũ hơn sẽ tải lại từ R2 mất 1–2 giây); lùi lại chương cách >2 chương trên điện thoại mất vài chục mili-giây bung lại ảnh.
- **Phương án 3B (Tắt hẳn cache file sách vào IndexedDB trên di động, luôn tải từ R2):**
  - *Điểm yếu:* Mất hoàn toàn mở lại `0ms` trên điện thoại và tốn lưu lượng 4G/5G mỗi lần mở lại cùng 1 cuốn.
- **Phương án 3C (Chỉ chia lô giải nén spine, giữ nguyên cache IndexedDB không giới hạn):**
  - *Điểm yếu:* Không xử lý tình huống tệp `Blob` cũ/đầy trong IndexedDB của tab chính iPhone gây crash lặp lại.

### QĐ-4: Cách triển khai *Thay tệp EPUB/DOCX tại chỗ* (Wave 2 — giữ tiến độ, bình luận, phân quyền)
- **Phương án 4A (Khuyến nghị — Endpoint `PUT /api/books/:id/replace-file` ghi tệp mới có version key `books/<id>-<ts>-<rand>.<ext>` + hoán đổi nguyên tử D1 + tự dựng lại `guest-pack`):**
  - Tải tệp mới sang R2 key mới (giữ nguyên tệp cũ sống trong suốt quá trình tải), kiểm tra trần `9.0 GiB` có trừ kích thước tệp cũ, cập nhật `file_key`/`file_type`/`file_size` trong D1 (giữ nguyên `books.id` nên giữ trọn 100% tiến độ Owner & Guest, dấu trang, highlight, đánh giá, bình luận, khoá tập/chương, ảnh bìa kệ), tự dựng lại `guest-pack` mới, xoá tệp R2 cũ + dọn cache IndexedDB của `file_key` cũ. Có tuỳ chọn tick *"Cập nhật ảnh bìa từ tệp mới"* (mặc định tắt để giữ bìa đang đẹp).
  - *Rủi ro / Hoàn tác:* Thấp; nếu lỗi ở giữa bước nào thì tệp cũ vẫn nguyên vẹn 100%.
  - *Điểm yếu:* Nếu bản EPUB mới đổi hoàn toàn cấu trúc số chương, mốc `chapterIndex` cũ có thể lệch nhẹ 1 chương (trình đọc tự kẹp an toàn không bao giờ lỗi).
- **Phương án 4B (Ghi đè thẳng lên đúng key `books/<id>.<ext>` cũ):**
  - *Điểm yếu:* Nếu mạng đứt giữa chừng sẽ phá hỏng tệp cũ đang dùng, và cache trình duyệt (`Cache-Control: immutable` + IndexedDB theo `file_key`) sẽ tiếp tục phục vụ file cũ.

### QĐ-5: Lưu trữ D1 cho Wave 3 (*Đăng xuất mọi thiết bị Admin* & *Nhóm quyền Discord Presets*)
- **Phương án 5A (Khuyến nghị — 1 migration cộng thêm `0019_v5_security_and_presets.sql`):**
  - Tạo 3 bảng nhỏ (`app_security_state` lưu `owner_min_iat`, `discord_access_presets`, `discord_access_preset_members`), thêm bước backfill `rl_last_strike_at` cho các dòng `rl_strikes > 0` tồn đọng trước migration `0017`, và xoá 2 index dư thừa (`idx_usage_daily_readers_day`, `idx_comment_reactions_comment`). Kèm auto-`CREATE TABLE IF NOT EXISTS` trong Worker để an toàn tuyệt đối.
  - *Rủi ro / Hoàn tác:* Rất thấp (chỉ thêm bảng/dọn index dư, không `DROP TABLE` bảng dữ liệu chính).
  - *Điểm yếu:* Cần chạy 1 lệnh apply migration `0019` lên remote D1 khi deploy Wave 3.
- **Phương án 5B (Lưu Presets nhóm bạn chỉ ở `localStorage` máy Admin):**
  - *Điểm yếu:* Không đồng bộ nhóm bạn giữa PC và iPhone của Admin, mất khi dọn trình duyệt, và vẫn cần D1 cho `owner_min_iat`.

---

## 2. Lộ trình triển khai chi tiết (3 Wave / 3 PR)

### Wave 1 — Vá toàn diện lỗi iPhone, Lõi Trình đọc/Upload/Worker, Hạ Entry Bundle, PWA & Auto-Test CI
- **Nhánh:** `fix/v5-wave1-mobile-audit-and-bundle` | **Migration D1:** `0` | **R2 re-pack:** `0 B`

#### Phase 1.1 — Vá 2 lỗi iPhone & Tối ưu RAM / Cache Mobile (`QĐ-2A`, `QĐ-3A`)
- **Files:** `src/components/LibraryHeader.tsx`, `src/components/Library2DView.tsx`, `src/components/AdminUsageView.tsx`, `src/components/ShelfCoverCard.tsx`, `src/lib/parsers.ts`, `src/lib/zipMediaCache.ts`, `src/lib/cache.ts`, `src/lib/api.ts`, `src/hooks/useCardReveal.ts`, `src/App.tsx`.
- **Chi tiết:**
  - Chuyển `LibraryHeader` & header `AdminUsageView` sang `fixed inset-x-0 top-0` + spacer chuẩn, dời `overflow-x-clip` vào `<main>`, bỏ `backdrop-blur-sm` trên mobile (`< md`) và trên badge tối của `ShelfCoverCard`.
  - Thêm menu gọn (`⋯`) trên Header mobile cho Owner mở nhanh *Bộ nhớ đệm*, *Sức khoẻ kho* và *Bảo mật*.
  - Đổi giải nén spine EPUB sang lô `4` tệp/lô (xả chuỗi gốc ngay); giảm `MEDIA_HYDRATE_CONCURRENCY` xuống `2` trên thiết bị di động & giữ tối đa ảnh đã bung của `3` chương quanh chương hiện tại (tự `URL.revokeObjectURL` các chương xa).
  - Thêm LRU giới hạn tối đa `6` sách (`<= 250 MB`) trong `book_blobs` trên mobile + tự kiểm tra header `PK` khi đọc `Blob` từ IndexedDB (nếu hỏng tự xoá mục cache & tải lại từ R2); chờ `waitForTransaction` ở `deleteFromStore` / `clear*` trong `cache.ts` và thêm in-flight dedup cho `fetchBookBlobCached`.
- **Rủi ro & hoàn tác:** Kiểm tra kỹ layout sticky/fixed khi mở modal, thanh tìm kiếm và khi xoay ngang màn hình; hoàn tác sạch bằng `git revert`.

#### Phase 1.2 — Vá lỗi Trình đọc, Parser, Guest Canvas & Tủ Gáy Sách
- **Files:** `src/lib/parsers.ts`, `src/lib/sanitizeHtml.ts`, `src/lib/readerConfig.ts`, `src/lib/epubFootnotes.ts`, `src/lib/epubSummaryExtractor.ts`, `src/lib/docxParser.ts`, `src/lib/readerSoundscapes.ts`, `src/lib/guestCrypto.ts`, `src/hooks/useGuestChapterStream.ts`, `src/hooks/useGuestCanvasViewport.ts`, `src/hooks/useReaderController.ts`, `src/hooks/useReaderChapterProgress.ts`, `src/hooks/useReaderScrollGestures.ts`, `src/hooks/useDomReadingRuler.ts`, `src/hooks/useBookReader.ts`, `src/components/ReaderView.tsx`, `src/components/ReaderPaginatedView.tsx`, `src/components/ReaderIllustrationGallery.tsx`, `src/components/ReaderImageLightbox.tsx`, `src/components/ReaderHighlightPopover.tsx`, `src/components/GuestCanvasReader.tsx`, `src/components/GuestCanvasPaginatedView.tsx`, `src/components/SpineBookshelfSlot.tsx`, `src/components/SpineBookshelfView.tsx`.
- **Chi tiết:**
  - Sửa `parseAndSanitizeEpubBody`: chuyển từ `XMLSerializer` (xuất lại thẻ tự đóng XML gây vỡ HTML5) sang chuyển đổi DOM trực tiếp qua `document.importNode` / HTML serialization mở rộng đủ thẻ non-void (`<a/>`, `<div/>`, `<b/>`, `<script/>`, `<textarea/>`...); bật `FORCE_BODY: true` + kiểm tra `null` trong `sanitizeHtmlToBody` (xóa hàm chết `sanitizeBookDocument`).
  - Xoá độ trễ 1 nhịp của `activeStreamIdx` trong `GuestCanvasReader` (kiểm tra khớp `chapterData.id === tocChapters[chapterIndex]?.id` trước khi áp `searchTarget`, `restoreTargetRatioRef` và tự hoàn thành chương cuối).
  - Sửa deadlock `scheduleThumbFetch` trong `ReaderIllustrationGallery.tsx` (lưu đúng reference wrapper khi `onAbort` và gọi tiếp mục kế khi gặp item đã abort); sửa đóng `ownedBitmap` sớm dưới `<StrictMode>` ở `ReaderImageLightbox` & rò rỉ nếu unmount giữa chừng.
  - Sửa 4 điểm tương tác Owner Lazy Media (`ensureChapterMedia` chưa xong không đánh dấu hoàn thành sớm, không mở Lightbox trên GIF 1×1, đồng bộ lại `useDomReadingRuler` / `ReaderPaginatedView` và chờ hydrate trước khi nhảy Tìm chữ/Dấu trang).
  - Sửa `useGuestChapterStream` (cập nhật `imageSizes` đồng bộ khi quay lại chương đã có bitmap trong `bitmapsRef`), xoá `guestIllustrationsCache` khi đăng xuất/đổi phiên.
  - Sửa phím tắt `M`/`B`/`F` (`useReaderController.ts`), bỏ gửi đúp `PUT /progress` ở `restartBookReread`, sửa `usePullToNextChapter` (reset khi đổi chương & bỏ qua mép trái `clientX <= 24`), sửa `readerSoundscapes.ts` (kiểm tra `ctx.state === 'running'` sau `visibilitychange` + dùng `cancelAndHoldAtTime` tránh tiếng bụp trên iOS Safari), sửa `findCanvasFootnoteAtPoint` truyền `fontWeight`, sửa `extractBookAutoDescription` bọc `safeDecodeUri`, sửa chú thích bảng DOCX (`noteRefs`), sửa backdrop `ReaderHighlightPopover` không chặn kéo chọn chữ mobile, sửa race `fetchRemoteReaderSettings` (không đè khi người dùng đã sửa local trong phiên).
  - Sửa 2-tap `SpineBookshelfSlot` trên Android/Chromium (phân biệt `focus` do touch với keyboard) và đồng bộ breakpoint compact `SpineBookshelfView` (`640px`) tránh cắt đỉnh 20px ở màn `622–639px`.

#### Phase 1.3 — Vá lỗi Upload Song song, Metadata `D-044`, Store & UI Thư viện
- **Files:** `src/lib/uploadBatchHelpers.ts`, `src/lib/apiAdminMutations.ts`, `src/lib/authorHeuristics.ts`, `src/lib/seriesShelfExtractor.ts`, `src/lib/shelfPlacement.ts`, `src/lib/shelfSummary.ts`, `src/lib/bookMetadata.ts`, `src/lib/nextVolume.ts`, `src/lib/commandPaletteSearch.ts`, `src/lib/quoteMarkdownExport.ts`, `src/lib/readingStats.ts`, `src/hooks/useLibraryDataStore.ts`, `src/hooks/useLibraryUserActions.ts`, `src/hooks/useLibraryViewState.ts`, `src/components/UploadDropzone.tsx`, `src/components/BookInfoModal.tsx`, `src/components/ShelfDetailView.tsx`, `src/components/AniListSuggestPanel.tsx`, `src/components/CollectionManagerModal.tsx`, `src/components/AdminProtectionModal.tsx`, `src/components/AdminUsageGuestTable.tsx`, `src/components/QuoteVaultModal.tsx`, `src/components/ReadingStatsModal.tsx`, `src/components/AuthGate.tsx`.
- **Chi tiết:**
  - Chặn ghi đè ngược `storage` khi upload song song (dùng monotonic merge hoặc chỉ giữ snapshot lớn hơn / cập nhật từ server sau batch); không nuốt `ApiAuthError (401)` hay `413` ở `PUT /cover` & `PUT /guest-pack` (báo cảnh báo rõ nếu sách mất bìa hoặc chưa có gói khách); huỷ dừng sạch hơn khi `PUT /file` lỗi và sửa chữ `"Tải tuần tự"` ở `UploadDropzone`.
  - Vá chống tải trùng `duplicateKey`: so khớp thêm theo `normalizedTitle` (không bị trượt khi sách cũ đã có tác giả từ `<dc:creator>` hoặc sửa tay/AniList) và tái sử dụng `buildLibraryDuplicateKeys`.
  - Khắc phục race kế thừa tác giả & gom kệ sách lẻ khi `concurrency = 2`: serialize nhẹ cặp cùng bộ mới chưa có trên kệ hoặc các tập lẻ không có tác giả trên tên file.
  - Vá `D-044`: tách rạch ròi **rác nhóm dịch cần bỏ** (`[Hako]`, `Calibre`, `Full`, URL...) với **phụ đề tập cần giữ vào `title`** (dấu `?!…:`, chữ số, `after the end`...); sửa `getHealedTitleInShelf` / `isUniqueSubtitleInShelf` tuyệt đối không nối rác hay tên tác giả thật vào `book.title` trong D1; sửa `buildShelfAuthorContext` fallback `'kho chưa phân loại'` và bỏ cắt nhầm `Man I` / `Book a` ở `shelfPlacement.ts`.
  - Vá `activeCollectionId` rò rỉ sang Trang chủ (`useLibraryViewState.ts`), `legacyCoverSync` bỏ qua sách `cover_key === null`, dọn sạch state khi di chuyển/xoá/đăng xuất ở `useLibraryDataStore`, dùng `progressRef` + version guard trong `useLibraryUserActions`, thêm `.normalize('NFC')` tại `BookInfoModal`/`App.tsx`/`nextVolume.ts`, sửa `onSelectAuthor` ở `App.tsx`, sort `matchedQuotes` theo `score`, tăng revoke URL Markdown từ `1s` → `45s`, reset `onlyPtrVolumes` trong `ShelfDetailView`, vá `401`/abort/unmount guard ở các modal Admin/Catalog, dọn trường `hp`/`mana` 3D thừa và chuỗi `"Chế độ 2D"`.

#### Phase 1.4 — Vá lỗi Backend Cloudflare Worker
- **Files:** `workers/r2-storage/src/guestAccessBatchDb.ts`, `workers/r2-storage/src/guestPack.ts`, `workers/r2-storage/src/guestRoutes.ts`, `workers/r2-storage/src/guestIllustrations.ts`, `workers/r2-storage/src/guestSearch.ts`, `workers/r2-storage/src/bookUploadRoutes.ts`, `workers/r2-storage/src/guestPackUpload.ts`, `workers/r2-storage/src/booksDb.ts`, `workers/r2-storage/src/progressDb.ts`, `workers/r2-storage/src/bookmarksDb.ts`, `workers/r2-storage/src/highlightsDb.ts`, `workers/r2-storage/src/rateLimitDb.ts`, `workers/r2-storage/src/shelfRelationsDb.ts`, `workers/r2-storage/src/shelfMutationsDb.ts`, `workers/r2-storage/src/communityDb.ts`, `workers/r2-storage/src/discordRelease.ts`, `workers/r2-storage/src/discordReleaseFormat.ts`, `workers/r2-storage/src/discord.ts`, `workers/r2-storage/src/forensicWatermark.ts`, `workers/r2-storage/src/bookChapterAccessDb.ts`, `workers/r2-storage/src/bookChapterAccessAdminDb.ts`.
- **Chi tiết:**
  - **Chống cache stampede `10ms` CPU Free Tier (`guestAccessBatchDb.ts`):** thêm single-flight `inFlightLegacyPackMap` (khử trùng lặp 3 request ảnh đồng thời), chỉ giải nén các chương đang mở có giới hạn an toàn, tận dụng `media[i].ch` trong `guestIllustrations.ts` và chuyển `guestIllustrations.ts` + `guestSearch.ts` sang `loadGuestBookAccessAndPackBatch`.
  - **Chống race condition upload R2/D1:** thêm hậu tố ngẫu nhiên cho `coverKey`/`packKey` và `fileKey` (`crypto.randomUUID().slice(0, 8)`), đọc lại key thực tế bằng `RETURNING` / kiểm tra `WHERE cover_key = ?` để không bao giờ rollback về key đã xoá hay ghi đè nhầm `books/:id`.
  - **Sửa `/toc?includeChapter=`:** không nuốt `401` (đóng phiên strike 10), ghi nhận đủ `rate_limit_hits` khi chạm `429`.
  - **Sửa phân quyền & tiến độ:** lọc bỏ tiến độ sách bị khoá khi `GET /api/books` trả cho Guest; thêm `assertGuestChapterAccess` vào `PUT /api/progress`; cắt `.normalize('NFC').slice(0, 120)` TRƯỚC `assertGuestChapterAccess` ở `bookmarksDb`/`highlightsDb`; fail-closed `404` khi `bookRow` null; sửa `progressDb` tách mốc đo `readingDeltaSec` khỏi lần lưu `readingDeltaSec = 0` và chặn bơm khống `FIRST_BOOK_SAVE_MAX_SEC` xuyên nhiều sách bằng cách đối chiếu đồng hồ `usage_daily_readers`; sửa `DECAYED_STRIKE_AT_SQL` để strike cũ trước `0017` giảm đúng mốc 30 phút.
  - **Sửa toàn vẹn dữ liệu & giới hạn Worker:** sửa `mergeShelfRelationsOnRename` & `upsertShelfRelation` (chống cạnh ngược chiều + giữ thứ tự `same_universe` + cho sửa cạnh khi đủ 30); hạ `MAX_GROUPS_PER_ANNOUNCE` xuống `12` (giữ dưới trần `50` subrequest); đồng bộ nâng mốc `chapter_number` của reply khi sửa bình luận gốc; chống TOCTOU login brute-force (kiểm tra và tăng đếm nguyên tử hoặc lock theo cửa sổ); giảm chunk `cleanupOrphanShelves` cho `shelf_relations` xuống `40` (dưới trần `100` bind params); sửa đếm dư `remaining` ở `discordReleaseFormat.ts`, thêm timeout `AbortController` cho `/setup-bell` và sửa bất đối xứng `< 3` ký tự ở `forensicWatermark.ts`; xoá hàm chết `assertGuestMediaInUnlockedChapters`.

#### Phase 1.5 — Tính `%` trọng số chương (`bookPercent` PA-A), Giải phóng Entry Bundle (~53.7 kB), PWA `SKIP_WAITING`, Auto-Test & CI Guardrails + Tài liệu
- **Files:** `src/types.ts`, `src/lib/readingEstimate.ts`, `src/hooks/useReaderChapterProgress.ts`, `src/components/ReaderView.tsx`, `src/components/GuestCanvasReader.tsx`, `src/lib/bookMetadata.ts`, `src/hooks/useLibraryUserActions.ts`, `src/lib/usageApi.ts`, `workers/r2-storage/src/{progressDb,booksDb,usageQueries,usageDb}.ts`, `workers/r2-storage/schema.sql`, `src/App.tsx`, `src/components/AuthenticatedLibraryShell.tsx` *(mới)*, `src/main.tsx`, `src/components/AuthGate.tsx`, `tailwind.config.js`, `vite.config.ts`, `index.html`, `public/sw.js`, `src/lib/pwaRegister.ts`, `src/hooks/useToast.ts`, `src/components/ToastContainer.tsx`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `package.json`, `scripts/{run-tests,check-bundle-budget}.mjs` *(mới)*, `tests/*.test.ts` *(mới)*, `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `HANDOFF.md`.
- **Chi tiết:**
  - Bổ sung tính `%` tiến độ đọc theo trọng số độ dài từng chương (`bookPercent` PA-A, `0 B` re-pack R2): Owner dùng số từ thật từng chương (`chapterWordCounts`), Guest dùng `computeGuestChapterWeights(tocChapters)` (`Math.max(0, compressedBytes - 180)`), chặn trần `99%` trước chương cuối (`computeWeightedBookPercent`), `100%` khi `completed`, fallback chia đều cho sách thuần tranh 0 chữ & bản ghi D1 cũ chưa có `bookPercent`; thêm cột additive `book_percent REAL` tự nâng cấp trên `reading_progress` & `guest_reading_progress`.
  - Lazy-load `AuthenticatedLibraryShell` trong `App.tsx`, lazy-import `src/styles/reader.css` trong `ReaderView`/`GuestCanvasReader`, chặn Vite base64-inline `src/assets/cursors/*.png` trong `vite.config.ts`, và đổi favicon `index.html` sang `logo-128.png` (21 KB thay vì 217 KB) → hạ entry `index-*.js` xuống `53.67 kB` gzip (`<< 86.04 kB`, `0` ảnh base64 trong entry CSS).
  - Thêm `.catch(() => Response.error())` ở nhánh CacheFirst của `public/sw.js` và nối `registration.waiting` / `updatefound` trong `pwaRegister.ts` hiển thị toast cập nhật 1 chạm gọi `SKIP_WAITING` (reload đúng 1 lần khi `controllerchange`).
  - Bổ sung bộ unit test tự động (`npm test`: 25/25 pass bằng `esbuild` + `node:test` + `jsdom` + `node:sqlite`, `0 B` runtime) kiểm tra `sanitizeHtml`, `readingEstimate`/`bookMetadata`, `authorHeuristics`/`seriesShelfExtractor`/`shelfPlacement`/`shelfUploadPlanner`, `tocFormat`/`readerChapterNumbers` & lõi Worker (`forensicWatermark`, `rateLimitDb`, `bookChapterAccessDb`, `shelfRelationsDb`, `discordReleaseFormat`, `progressDb`/`booksDb`/`usageDb`) và cổng CI `npm run check:bundle` chặn `index-*.js > 86.04 kB` gzip + truyền đúng `VITE_BASE_PATH=/` + nâng `deploy.yml`.
  - Cập nhật sạch `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (`D-046`) và `HANDOFF.md`.

---

### Wave 2 — Nâng cấp Quản trị Kho sách Admin (~260+ tập) & Tối ưu Tải Thư viện
- **Nhánh:** `feat/v5-wave2-admin-storage-and-catalog` *(tách từ `main` sau khi Wave 1 merge)* | **Migration D1:** `0`
- **Phase 2.1 — Thay tệp EPUB/DOCX tại chỗ giữ tiến độ & bình luận (`QĐ-4A`):**
  - Worker: `PUT /api/books/:id/replace-file` (`requireOwner`) trong `bookUploadRoutes.ts` (hoặc tách `bookReplaceRoute.ts` giữ `< 500` dòng).
  - Frontend: `replaceBookFile()` trong `apiAdminMutations.ts` + khu vực *"Thay tệp sách (giữ nguyên tiến độ, bình luận & phân quyền)"* trong `BookEditModal.tsx` (kèm tuỳ chọn cập nhật lại ảnh bìa, tự dựng & đẩy lại `guest-pack`, dọn cache IndexedDB cũ).
- **Phase 2.2 — Đối soát dung lượng R2 thực tế & Dọn rác mồ côi:**
  - Worker: `GET /api/admin/storage/reconcile` & `POST /api/admin/storage/reconcile/cleanup` (`requireOwner`, phân trang `BOOKS_BUCKET.list()` đối chiếu với `books.file_key`, `books.cover_key`, `book_guest_packs.pack_key`, chỉ cho xoá đối tượng mồ côi cũ hơn `24 giờ` để không đụng file đang upload).
  - Frontend: thẻ *"Đối soát kho R2 thực tế"* nạp lười trong `AdminUsageView` / `AdminStorageSecurityPanel.tsx`.
- **Phase 2.3 — Nâng cấp *Sức khoẻ kho sách* & Đồng bộ gói khách chọn lọc:**
  - Bỏ cắt cụt `.slice(0, 20/30)` trong `AdminLibraryHealthModal.tsx` (thêm phân trang/mở rộng & nút mở thẳng sửa metadata/AniList tại từng mục).
  - Nâng cấp `AdminProtectionModal.tsx`: cho phép lọc & đồng bộ lại `guest-pack` theo **từng bộ truyện hoặc từng cuốn** với `concurrency = 2` (file `<= 40 MB`) và sửa bug bấm Dừng vẫn báo tiến độ đã xong về store.
- **Phase 2.4 — Sao lưu / Khôi phục JSON Owner & Tối ưu `GET /api/books` (ETag / `304`):**
  - Worker: `GET /api/admin/backup/export` & `POST /api/admin/backup/import` (chỉ dữ liệu JSON của Owner: tiến độ, dấu trang, highlight, shelf prefs, tags, alt titles, relations, collections, access rules — xác thực chặt cấu trúc, `0 B` R2).
  - Worker + Frontend: sinh ETag yếu theo chữ ký thay đổi thư viện (`GET /api/books` hỗ trợ `If-None-Match` → `304 Not Modified`, kết hợp lưu bản nhớ nhẹ để mở lại thư viện trên 4G nhanh hơn).
- **Rủi ro & hoàn tác:** Không sửa schema D1; hoàn tác sạch bằng `git revert` + `wrangler rollback`.

---

### Wave 3 — Trải nghiệm Đọc Chuyên sâu, Bảo mật Tăng cường & Cộng đồng Discord Nâng cao
- **Nhánh:** `feat/v5-wave3-reader-ux-security-discord` *(tách từ `main` sau khi Wave 2 merge)* | **Migration D1:** `0019_v5_security_and_presets.sql` (`QĐ-5A`)
- **Phase 3.1 — Tải trước chương kế tiếp cho Khách Discord (Speculative Prefetch):**
  - Trong `useGuestChapterStream.ts` + `GuestCanvasReader.tsx`: khi khách đọc qua `>= 75–80%` chương hiện tại, chương `chapterIndex + 1` tồn tại, không bị `locked`, chưa nằm trong `chapterCacheRef` và không chạm lỗi `429` gần đây → âm thầm gọi `fetchGuestChapterDecrypted(bookId, chapterIndex + 1)` lưu sẵn vào `chapterCacheRef` (chỉ đúng 1 chương kế, huỷ ngay khi đổi chương/đóng sách).
- **Phase 3.2 — Thanh tua nhanh, Bảng phím tắt `?`, `<ModalShell>` thống nhất & Nạp dần Trang chủ:**
  - Chạm `ReaderFooterStatusBar` mở thanh trượt tua nhanh chương & tỷ lệ đọc (cả Owner lẫn Guest).
  - Thêm modal tra nhanh phím tắt (`?`) và thống nhất `<ModalShell>` (`createPortal` + `useBodyScrollLock` + focus-trap + `Esc`) cho toàn bộ 10 modal đang thiếu khoá cuộn nền trên mobile + tôn trọng `prefers-reduced-motion` cho `.reader-search-flash`, `.fade-in`, `.theme-icon-spin`.
  - Nâng cấp `LibraryHomeShelvesSection.tsx` nạp dần theo từng lô kệ (tránh mount cùng lúc 260+ `BookCard` ngay lúc mở Trang chủ trên điện thoại).
- **Phase 3.3 — Security Headers Worker, CSP Frontend & Nút *Đăng xuất mọi thiết bị Admin*:**
  - Gắn `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` trên mọi phản hồi Worker (`index.ts`, `r2Files.ts`, `guestPack.ts`).
  - Tách script theme ở `index.html` sang `public/theme-init.js` và gắn `<meta http-equiv="Content-Security-Policy">` + `referrer` meta chặt chẽ.
  - Thêm `app_security_state` (`owner_min_iat`) trong migration `0019` + nhúng `iat` vào Owner token mới (`auth.ts`, tương thích ngược token cũ bằng `exp - OWNER_TOKEN_TTL_MS`) + endpoint `POST /api/admin/sessions/revoke-owner` + nút *"Đăng xuất mọi thiết bị Admin"* trong `AdminProtectionModal` / `/usage`.
- **Phase 3.4 — Nhóm quyền Discord Presets, Ma trận quyền theo thành viên & Góc kiểm duyệt Bình luận `/usage`:**
  - Migration `0019`: `discord_access_presets` & `discord_access_preset_members`, API `GET/POST/PUT/DELETE /api/admin/discord-presets` & `GET /api/admin/discord-guests/:id/access-matrix` + thu hồi hàng loạt.
  - Tích hợp chọn nhanh Preset nhóm bạn trong `ShelfAccessModal` & `BookAccessModal`, xem toàn bộ quyền đang cấp của 1 thành viên trong `AdminDiscordGuestsPanel`.
  - Thêm mục *"Bình luận & Đánh giá mới nhất"* trên `/usage` (`GET /api/admin/usage/recent-community`, cho phép xoá nhanh bình luận vi phạm ngay tại chỗ) và hỗ trợ biến bí mật tuỳ chọn `DISCORD_ADMIN_ALERT_WEBHOOK_URL` (`wrangler secret put`) bắn cảnh báo khi có tài khoản chạm strike 10 hoặc IP bị khoá brute-force đăng nhập.
- **Rủi ro & hoàn tác:** Migration `0019` hoàn toàn cộng thêm (không sửa/xoá bảng dữ liệu chính); rollback code qua `git revert` + `wrangler rollback` trong 30 giây.

---

## 3. Checklist kiểm thử bắt buộc trước khi xem là xong (cho từng Wave)

### Wave 1
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi file `<= 500` dòng), `npm run build` (`index-*.js = 53.67 kB <= 65 kB` gzip `<< 86.04 kB`), `npm run check:bundle`, `npm test` (25/25 unit test xanh), `npx tsc --noEmit` trong `workers/r2-storage`.
- [x] **Kiểm thử trên trình duyệt thật (Desktop `1280×800` + Mobile `390×844`):**
  - Cuộn lên/xuống mạnh ở Tab Thư viện & Trang chủ: `<header>` ghim cứng `top = 0px` (`position: fixed`) không rung, không hở khe lộ chữ phía trên, `scrollWidth <= 390`.
  - Mở sách EPUB (cả Cuộn dọc + Lật trang 2 cột): tải mượt, ảnh bung `blob:` đúng chương, `%` đọc tính chuẩn theo trọng số độ dài chương (`bookPercent` PA-A — cuối `Mở đầu` không nhảy `40%`), không đánh dấu hoàn thành sớm, phím `M` bật/tắt mục lục ổn định, `0` lỗi console/page.
  - Menu gọn `⋯` trên mobile mở được *Bộ nhớ đệm thiết bị*, *Sức khoẻ kho sách* (và *Bảo mật* ở Cloud mode).
  - EPUB có thẻ tự đóng non-void (`<a id="fn1"/>`, `<div/>`, `<b/>`, `<script/>`) & `<frameset>` hiển thị đủ chữ (`<b></b>` đóng gọn không làm đậm đoạn sau), sạch XSS, không crash (đã xác minh cả trên trình duyệt thật & `tests/sanitizeHtml.test.ts`).
  - Guest Canvas, Upload song song, `D-044` & Worker: kiểm chứng toàn bộ qua `tests/*.test.ts` (25/25 pass, bao gồm real SQLite D1 & JSDOM `DOMPurify`) + kiểm chứng trình duyệt upload `Unnamed Memory - Tập 1 - [Hako].epub` tách chuẩn `[Hako]` & `<dc:creator>`. *(Chờ xác nhận người dùng trước khi `wrangler deploy` Worker & push tạo PR Wave 1).*
- [x] Cập nhật `README.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `HANDOFF.md` trong cùng commit cuối Wave 1.

### Wave 2
- [ ] Thay tệp EPUB/DOCX tại chỗ giữ nguyên 100% tiến độ (Owner & Guest), dấu trang, highlight, đánh giá, bình luận, phân quyền và tự cập nhật `guest-pack` + xoá tệp R2 cũ + làm mới cache IndexedDB.
- [ ] Đối soát R2 liệt kê đúng file mồ côi và chỉ dọn file > 24h; bảng *Sức khoẻ kho sách* xem đủ toàn bộ mục; đồng bộ gói khách chọn lọc 1 bộ/1 cuốn hoạt động mượt.
- [ ] Xuất/nhập sao lưu JSON Owner khôi phục chính xác; `GET /api/books` trả `304` khi `If-None-Match` khớp.
- [ ] `typecheck`, `lint`, `build`, `test`, `tsc` Worker + cập nhật tài liệu & `HANDOFF.md`.

### Wave 3
- [ ] Khách Discord đọc tới ~80% chương mở tự prefetch chương `N+1` (bỏ qua chương khoá), bấm sang chương hiển thị tức thì `0ms`, vẫn giữ đủ thuỷ vân + `D-028`.
- [ ] Thanh kéo tua nhanh, bảng phím tắt `?`, `<ModalShell>` khoá cuộn nền trên mọi modal mobile, Trang chủ nạp dần mượt; `prefers-reduced-motion` tắt sạch animation.
- [ ] Worker có đủ `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; Frontend chạy sạch với CSP (`0` lỗi console); nút *Đăng xuất mọi thiết bị Admin* thu hồi ngay token Admin cũ (`401`).
- [ ] Áp migration `0019` thành công lên local & remote D1; Presets nhóm bạn Discord, Ma trận quyền thành viên, Bảng bình luận mới nhất `/usage` và cảnh báo webhook (khi cấu hình) hoạt động chính xác.
- [ ] `typecheck`, `lint`, `build`, `test`, `tsc` Worker + cập nhật `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `HANDOFF.md`.
