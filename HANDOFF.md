# HANDOFF
Cập nhật: 2026-11-24 21:00 | Nhánh: fix/post-v3-audit-fixes | Build: 🟢 typecheck / lint / Worker tsc / build (`83.02 kB` gzip) xanh
Nhiệm vụ hiện tại: **Đã hoàn tất kiểm toán & vá dứt điểm toàn bộ 16 hạng mục hậu v3 / hậu gỡ 3D (`D-041`) — sẵn sàng mở PR vào `main` và áp dụng migration `0017` lên D1 production**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/post-v3-audit-fixes.md

## Đang làm dở
- Không có việc làm dở trên nhánh `fix/post-v3-audit-fixes`.

## Xong trong nhánh này
1. **Phase 1 — Worker, D1, R2 & Discord (`workers/r2-storage/src/`):**
   - Migration `0017_rl_last_strike_at.sql` + `rateLimitDb.ts` + `auth.ts`: triển khai **QĐ-1 (`1A`)** bỏ reset `rl_strikes` sau 1 request sạch (hồi `-1 strike / 30p` yên ổn, reset sau `>= 24h`); nâng cấp `timingSafeEqual` sang HMAC-SHA-256 32 byte + `crypto.subtle.timingSafeEqual`.
   - `progressDb.ts` & `usageRecorder.ts`: bỏ cộng cứng `+3s`/`+2s`, trả `readingDeltaAccepted` chính xác qua `env.DB.batch([...])`.
   - `communityReactionsDb.ts`, `booksDb.ts`, `shelfMutationsDb.ts`, `communityDb.ts`: xoá `library_comments` không bị rollback khi thiếu `library_comment_reactions`; reply cưỡng chế `Math.max` chương trên cả `POST`/`PATCH`, `EXISTS` kiểm tra bình luận cha trong `INSERT` và `LIMIT 500` cho `repliesRes`.
   - `shelfAccessDb.ts`, `discordReleaseFormat.ts`, `discordRelease.ts`, `highlightsDb.ts`, `catalogEnhancementsDb.ts`, `readingActivityDb.ts`: thống nhất NFC/NFD; escape `embed.title`, cắt tag trước escape, fallback bìa R2 kèm `body.cancel()` & báo `truncatedGroups`; bổ sung 2 index `0015` và chuỗi ngày theo kỳ UTC+7 (`3A`).
2. **Phase 2 — Trình đọc DOM/Guest Canvas, Nhạc nền iOS, Furigana & Cử chỉ Mobile:**
   - `rubyText.ts`, `guestCanvasMetrics.ts`, `guestCanvasLayout.ts`, `guestCanvasPaint.ts`, `guestPackBuilder.ts`, `domHighlights.ts`, `parsers.ts`, `readerSearchJump.ts`: bảo toàn `<ruby><rt>` khi `justify`, headroom heading/quote/list, tách đa `<rb>/<rt>`, và loại `<rt>/<rp>` khỏi DOM Highlight & Tìm chữ.
   - `readerChapterNumbers.ts`, `useReaderBookFeatures.ts`, `CommunityCommentItem.tsx`, `CommunityReviewsSection.tsx`, `ReaderView.tsx`, `GuestCanvasReader.tsx`, `GuestCanvasScrollStage.tsx`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`, `ReaderPaginatedFooter.tsx`: chuẩn hoá chương 1-1 Owner/Guest (**QĐ-2 = `2A`**), ẩn nhánh replies theo cha spoiler và không che oan người đã đọc qua/xong.
   - `readerSoundscapes.ts`, `useReaderImmersionTools.ts`, `useReaderScrollGestures.ts`, `usePaginatedReadingRuler.ts`, `useDomReadingRuler.ts`, `ReaderTocDrawer.tsx`, `ReaderScrollEnhancements.tsx`, `useLibraryDataStore.ts`: vá iOS Safari `'interrupted'` & Sleep Timer fade-out, `Esc`/Immersive đóng `soundOpen`, kéo đáy `scrollStageReady`, Thanh dẫn mắt 2 cột & chương ngắn, `role="dialog"` TOC, Auto-scroll nhường tay, gỡ side-effect khỏi React state updater.
3. **Phase 3 — 2D UI, Wrapped PNG, `Ctrl+K`, Phân kệ & Tối ưu Bundle:**
   - `wrappedPosterCanvas.ts`, `ReadingWrappedModal.tsx`, `readingStreak.ts`: chuẩn kỳ UTC+7 (**QĐ-3 = `3A`**), bìa `object-cover` ưu tiên bìa kệ/Tập 1, tải chủ động font `400/600/700`, `Esc` đóng modal, giữ ObjectURL `45s`.
   - `App.tsx`, `CommandPaletteModal.tsx`, `useTheme.ts`, `bookMetadata.ts`, `shelfPlacement.ts`, `shelfUploadPlanner.ts`, `ShelfFanStack.tsx`, `src/index.css`, `ReaderOverlaysHost.tsx`, `ReaderTopBar.tsx`: sửa đóng `Ctrl+K` / không xoá query, vá race `useTheme`, NFC `groupBooksIntoShelves`, đồng tác giả `"và"` & số La Mã chuẩn `I..XX`, tách `shelfUploadPlanner.ts` khỏi entry (`index-*.js = 83.02 kB` gzip) và lazy-load Popovers/TOC trong trình đọc (chunk trình đọc dùng chung giảm từ `29.47 kB` xuống `21.57 kB` gzip).
4. **Kiểm chứng:** `typecheck`, `lint` (0/0), Worker `tsc`, `build` đều xanh; kiểm thử Worker + D1 cục bộ (7/7 nhóm), unit tests Phase 2–3 và kiểm thử trình duyệt thật Desktop `1280×800` + Mobile `390×844` (`0` lỗi Console/Page).

## Bước tiếp theo
1. Push nhánh `fix/post-v3-audit-fixes` và mở Pull Request vào `main`.
2. Trước/khi deploy Worker mới lên production: chạy `npx wrangler d1 migrations apply DB --remote` trong `workers/r2-storage` để áp dụng `migrations/0017_rl_last_strike_at.sql` (Worker cũng đã có auto-`ALTER` dự phòng an toàn).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp/thư mục chưa theo dõi sẵn từ trước ở thư mục gốc ngoài Git.
