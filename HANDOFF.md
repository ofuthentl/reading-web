# HANDOFF
Cập nhật: 2026-11-25 16:57 | Nhánh: fix/v5-wave1-mobile-audit-and-bundle | Build: 🟢 XANH (`index-*.js = 53.67 kB` gzip `<< 86.04 kB`, `npm test` 25/25)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 1 (`D-046` — chốt `1A`, `2A`, `3A`, `4A`, `5A` + `bookPercent` PA-A, bỏ qua macOS NFD)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- **Wave 1 (Phase 1.1 → 1.5) ĐÃ HOÀN TẤT 100%, ĐÃ DEPLOY WORKER LÊN PRODUCTION & ĐÃ PUSH NHÁNH** (`typecheck`, `lint` 0/0 mọi tệp `<= 500` dòng, `npm test` 25/25 pass, `VITE_BASE_PATH=/ npm run build` đạt `53.67 kB` gzip, `npm run check:bundle`, Worker `tsc --noEmit`, kiểm thử trình duyệt thật Desktop `1280×800` + Mobile `390×844` với `0` lỗi console/page).
- Sẵn sàng mở Pull Request từ `fix/v5-wave1-mobile-audit-and-bundle` vào `main` để GitHub Actions CI kiểm tra và tự deploy Frontend lên `ofu.lol`.

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
- Thêm single-flight `inFlightLegacyPackMap` + LRU theo `(packKey, lockedKeys)`, fail-closed `404`, chuyển `guestIllustrations`/`guestSearch` sang `loadGuestBookAccessAndPackBatch` + đường nhanh `media[i].ch`; hậu tố ngẫu nhiên 8 ký tự + upload nguyên tử R2/D1; `/toc?includeChapter=` không nuốt `401` & ghi `rate_limit_hits`.
- Lọc bỏ `progress` sách khoá cho Guest, thêm `assertGuestChapterAccess` vào `PUT /progress`, tách đồng hồ đọc `claimReadingTimeBudget`, chuẩn hoá NFC trước check quyền ở `bookmarksDb`/`highlightsDb`, vá `DECAYED_STRIKE_AT_SQL` + `consumeLoginAttempt` chống TOCTOU, sửa `mergeShelfRelationsOnRename`/`upsertShelfRelation`, hạ chunk `cleanupOrphanShelves = 40`, đồng bộ `chapter_number` reply con (`communityRoutes.ts`), hạ `MAX_GROUPS_PER_ANNOUNCE = 12`, sửa `remaining`, timeout `2.2s` `/setup-bell` + cooldown 15s nguyên tử, sửa đối xứng `< 3` ký tự `forensicWatermark`.

### Phase 1.5 — `%` trọng số chương (PA-A), Hạ Entry `53.67 kB`, PWA `SKIP_WAITING`, Unit Tests & CI
- Thêm `bookPercent` PA-A (`computeWeightedBookPercent` + `computeGuestChapterWeights` trừ 180 B vỏ gzip + cột additive `book_percent REAL` ở D1, chặn trần `99%` trước chương cuối, `0 B` re-pack R2, tương thích ngược bản ghi cũ).
- Tách `AuthenticatedLibraryShell.tsx` nạp lười khỏi `App.tsx`, dời `reader.css` sang trình đọc (đồng bộ `font-mono` cho `AuthGate`), tắt base64-inline con trỏ trong `vite.config.ts` (`0` ảnh inline trong CSS entry), đổi favicon sang `logo-128.png` → hạ `index-*.js` xuống **`53.67 kB` gzip**.
- Vá `.catch(() => Response.error())` nhánh CacheFirst ở `public/sw.js` & nối Toast cập nhật PWA 1 chạm `SKIP_WAITING` (`pwaRegister.ts`, `useToast.ts`, `ToastContainer.tsx`, `App.tsx`).
- Bổ sung bộ Unit Test tự động (`npm test`: 25/25 pass, `0 B` runtime), cổng `npm run check:bundle`, nâng cấp `.github/workflows/{ci,deploy}.yml` (Node 24, `VITE_BASE_PATH=/`, `actions-gh-pages@v4`), cập nhật `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (`D-046`).

## Bước tiếp theo
1. Mở & merge Pull Request Wave 1 (`fix/v5-wave1-mobile-audit-and-bundle` → `main`) sau khi CI xanh để auto-deploy Frontend lên `ofu.lol`.
2. Sau khi Wave 1 merge vào `main`, tách nhánh mới `feat/v5-wave2-admin-storage-and-catalog` cho **Wave 2**.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
