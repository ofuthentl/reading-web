# HANDOFF
Cập nhật: 2026-11-25 15:52 | Nhánh: fix/v5-wave1-mobile-audit-and-bundle | Build: 🟢 XANH (`index-*.js = 76.00 kB` gzip `<< 86.04 kB`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 1 (`D-046` — chốt `1A`, `2A`, `3A`, `4A`, `5A`, bỏ qua mục macOS NFD)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Đã hoàn tất & kiểm chứng xanh **Wave 1 — Phase 1.1, Phase 1.2, Phase 1.3 và Phase 1.4** (`workers/r2-storage` `tsc --noEmit`, root `typecheck`, `lint` 0/0 mọi tệp `<= 500` dòng, `build` xanh, toàn bộ assertions SQLite thực tế Phase 1.4 pass 100%). Chưa deploy Worker (sẽ deploy cùng cuối Wave 1 ở Phase 1.5).

## Xong trong nhánh này
### Phase 1.1 — Vá 2 lỗi iPhone & RAM/Cache Mobile (`QĐ-2A`, `QĐ-3A`)
- Đổi `<header>` (`LibraryHeader`, `AdminUsageView`) sang `fixed inset-x-0 top-0` + spacer `ResizeObserver`, dời `overflow-x-clip` xuống `<main>`, bỏ `backdrop-blur` nặng trên mobile/badge tối, tách `LibraryMobileOwnerMenu.tsx`.
- Giải nén spine EPUB theo lô `4` tệp/lô, sửa `parseAndSanitizeEpubBody` sang HTML5 fragment serializer + null-guard `<frameset>`, hạ concurrency ảnh mobile xuống `2` + thu hồi `ObjectURL` chương xa, kiểm tra chữ ký ZIP `PK` + LRU di động `<= 6` sách / `<= 250 MiB` + `inFlightBookFetches`, tách nạp lười `LazyLibrary2DView`.

### Phase 1.2 — Vá lỗi Trình đọc, Guest Canvas, Owner Lazy Media, Soundscapes & Tủ Gáy Sách
- Đồng bộ `GuestCanvasReader`/`useGuestChapterStream`/`useGuestCanvasViewport`/`GuestCanvasPaginatedView` bỏ trễ 1 nhịp & đồng bộ lại `imageSizes`; sửa deadlock `scheduleThumbFetch` (`ReaderIllustrationThumbs.tsx`) + unmount clone + Lightbox `<StrictMode>`.
- Vá 4 tương tác Owner Lazy Media, dọn `guestIllustrationsCache`, phím tắt `M`/`B`/`F` đóng drawer, bỏ gửi đúp `PUT /progress` ở `restartBookReread`, reset `usePullToNextChapter` + tránh mép trái `24px`, `readerSoundscapes` iOS Safari, `fontWeight` footnotes, `safeDecodeUri`, DOCX table `noteRefs`, bỏ backdrop `ReaderHighlightPopover`, chặn race `fetchRemoteReaderSettings`, 2-tap `SpineBookshelfSlot` & breakpoint `640px`.

### Phase 1.3 — Vá Upload Song song, Metadata `D-044`, Store & UI Thư viện
- Trích `bookUploadClient.ts`, merge `storage` đơn điệu + đồng bộ lại `GET /api/storage`, huỷ ngay `buildGuestPackEnvelope` khi `PUT /file` lỗi, không nuốt `401`/`413` ở `PUT /cover` & `PUT /guest-pack` kèm cảnh báo vàng rõ, serialize nhẹ cùng bộ mới & tập lẻ chưa rõ tác giả, bổ sung chống trùng `normalizeBookTitleDuplicateKey`.
- Vá heuristics `D-044` (`isReleaseMetadataNoise` vs phụ đề hợp lệ, không nối rác/tác giả thật vào `book.title`, bảo toàn đồng tác giả, fallback `'kho chưa phân loại'`, chặn cắt nhầm `"Man I"`/`"Book a"`), vá store/lọc/dọn orphan/abort+401 trên toàn bộ modal & `AuthGate`.

### Phase 1.4 — Vá Backend Cloudflare Worker (`workers/r2-storage/src/`, `0` migration D1)
1. **Chống cache stampede & tối ưu Guest (`guestAccessBatchDb`, `guestIllustrations`, `guestSearch`, `bookChapterAccessDb`):**
   - Thêm single-flight `inFlightLegacyPackMap` + LRU theo `(packKey, lockedKeys)`, chỉ giải nén chương mở có giới hạn an toàn & bỏ qua `JSON.parse` chương không có ảnh; fail-closed `404` khi `bookRow === null`; chuyển `guestIllustrations`/`guestSearch` sang `loadGuestBookAccessAndPackBatch` + đường nhanh `media[i].ch` (`0` R2 read); xoá hàm chết `assertGuestMediaInUnlockedChapters`.
2. **Upload nguyên tử R2/D1 & `/toc?includeChapter=` (`bookUploadRoutes`, `guestPackUpload`, `guestPack`, `guestRoutes`):**
   - Gắn hậu tố ngẫu nhiên 8 ký tự cho `fileKey`/`coverKey`/`packKey`; dùng `INSERT`/`UPDATE ... WHERE quota <= limit RETURNING` nguyên tử trong `db.batch` + đọc `actualPrev` đúng trước khi ghi và xác minh `committed` an toàn khi lỗi D1; `/toc?includeChapter=` không nuốt `401` strike-10 và ghi đủ `rate_limit_hits` khi `429`.
3. **Phân quyền, đồng hồ đọc, rate-limit & toàn vẹn D1 (`booksDb`, `progressDb`, `usageRecorder`, `bookmarksDb`, `highlightsDb`, `rateLimitDb`, `index`, `shelfRelationsDb`, `shelfMutationsDb`, `communityDb`, `communityRoutes`, `discordRelease`, `discordReleaseFormat`, `discord`, `forensicWatermark`, `bookChapterAccessAdminDb`):**
   - Lọc bỏ `progress` sách khoá cho Guest trong `GET /api/books`; thêm `assertGuestChapterAccess` vào `PUT /progress`, tách đồng hồ đọc `claimReadingTimeBudget` (`usage_daily_readers.last_reading_sync_at`) để `readingDeltaSec = 0` không đẩy lùi đồng hồ & chặn bơm khống đa sách; chuẩn hoá NFC + cắt `120` trước `assertGuestChapterAccess` ở `bookmarksDb`/`highlightsDb`.
   - Sửa `DECAYED_STRIKE_AT_SQL` cho dòng strike trước `0017` và thay kiểm tra login thành `consumeLoginAttempt` nguyên tử chống TOCTOU; sửa `mergeShelfRelationsOnRename` & `upsertShelfRelation` (chống cạnh ngược chiều, giữ chuẩn `same_universe`, kiểm tra cả 2 đầu & cho sửa cạnh ở trần 30); hạ chunk `cleanupOrphanShelves` xuống `40` (`<= 80` params); đồng bộ nâng `chapter_number` reply con khi sửa bình luận gốc (tách `communityRoutes.ts` giữ `<= 500` dòng); hạ `MAX_GROUPS_PER_ANNOUNCE = 12`; sửa tính dư `remaining` khi nhãn trùng; thêm `AbortController` `2.2s` cho `/setup-bell`, siết cooldown 15s nguyên tử & đổi copy `(quyền chỉ đọc)`; sửa đối xứng `< 3` ký tự ở `forensicWatermark.ts`.

## Bước tiếp theo
1. Tiếp tục **Wave 1 — Phase 1.5** (`AuthenticatedLibraryShell` hạ entry `~55–60 kB` gzip, PWA `SKIP_WAITING`, bộ unit test Node/TS + cổng CI, cập nhật tài liệu, deploy Worker & mở PR Wave 1).
2. Sau khi Wave 1 merge vào `main`, tách nhánh cho **Wave 2** rồi **Wave 3**.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
