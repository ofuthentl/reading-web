# Kế hoạch triển khai — Đợt nâng cấp v3: Trải nghiệm Đọc Chuyên sâu, Hình ảnh & Cộng đồng v2 (`D-039`)

> Nhánh thực hiện: `feat/v3-ux-and-community-upgrades` (tách từ `origin/main`, gộp 1 PR duy nhất với các commit nhỏ theo từng nhóm mục đích theo `QĐ-1 = 1B`).

## 1. Các quyết định đã chốt (`D-039`)
- **`QĐ-1 = 1B`:** Gộp trọn đợt nâng cấp v3 vào **1 PR duy nhất** trên nhánh `feat/v3-ux-and-community-upgrades`, chia thành các commit nhỏ độc lập theo nhóm mục đích.
- **`QĐ-2 = 2A`:** Mở rộng `settings_json` của bảng `user_reader_prefs` sẵn có (`GET/PUT /api/reader-settings`, `0` bảng thừa) để đồng bộ `dailyGoalMinutes` (mặc định `30`, nhận `0` hoặc `10..240`) và `readingRuler` (`boolean`); giữ `soundscape` và `autoScroll` chỉ ở `localStorage` và luôn mặc định **TẮT** khi mở sách.
- **`QĐ-3 = 3B`:** `GET /api/books` trả thêm `shelfRatings: Record<string, { average: number; count: number }>` tổng hợp từ `library_ratings` cho **tất cả các bộ kể cả bộ `restricted`** (nhất quán với `weeklyPopular`); giữ nguyên chốt chặn cứng `403 Forbidden` của `D-030` khi mở đọc hoặc gọi `/api/community*`.

## 2. Phân chia giai đoạn (Phases), Rủi ro & Cách hoàn tác

### Phase 1 — Backend Worker, Migration `0016` & Deep-link Discord
- **Phạm vi:**
  - `workers/r2-storage/migrations/0016_community_v2.sql` & `workers/r2-storage/schema.sql`: thêm `parent_id TEXT`, `chapter_number INTEGER` vào `library_comments`; thêm bảng `library_comment_reactions` (`emoji IN ('fire','cry','laugh','heart','mindblown')`) + 2 chỉ mục `idx_library_comments_parent`, `idx_comment_reactions_comment`.
  - Tách `workers/r2-storage/src/communityReactionsDb.ts` (giữ mọi tệp `<= 500` dòng hiệu dụng) & nâng cấp `communityDb.ts`: tự nâng cấp an toàn trong `ensureCommunityTables`, trả `shelfRatings` (`loadAllShelfRatingsMap`), hỗ trợ `PATCH /api/community/comments/:id` (chỉ chính chủ), `POST /api/community/comments` (`parentId` 1 cấp, chặn cấp 2, `chapterNumber` cấp `book`), `PUT /api/community/comments/:id/reaction` và xoá sạch phản hồi/reaction khi xoá bình luận, xoá sách (`booksDb.ts`) hoặc `cleanupOrphanShelves` (`shelfMutationsDb.ts`).
  - Nâng cấp `readerPrefsDb.ts` (`dailyGoalMinutes`, `readingRuler`), `readingActivityDb.ts` & `usageDb.ts` (bổ sung tổng hợp theo năm/tháng UTC+7 cho `Ofu's Library Wrapped`), `discordRelease.ts` (`/?shelf=` trên nút `🌐 Mở thư viện`) và `forensicWatermark.ts` (`rt?: string` tuỳ chọn cho Furigana).
- **Rủi ro:** Tệp `communityDb.ts` vượt 500 dòng hoặc xoá sách không xoá hết reaction mồ côi.
- **Giảm thiểu & Hoàn tác:** Tách `communityReactionsDb.ts`, đặt câu `DELETE FROM library_comment_reactions WHERE comment_id IN (SELECT id FROM library_comments ...)` tuần tự trước `DELETE FROM library_comments` trong `db.batch`. Hoàn tác bằng `git revert` commit Phase 1 (các cột mới đều nullable, tương thích ngược 100%).

### Phase 2 — Nhóm 1: Hình ảnh, Hiệu ứng, Điểm sao `★` & Deep-link Frontend
- **Phạm vi:**
  - `src/lib/coverAccentColor.ts` (nạp trong chunk lười, `0 B` entry): trích màu chủ đạo bằng Canvas `16×16` (`< 1 ms`, cache theo `coverKey`) + nền mờ `blur(48px) saturate(1.3)` (`14–22%`) trên `ShelfDetailHero.tsx` & `BookInfoModal.tsx`.
  - `ShelfCoverCard.tsx` (`Stacked Deck` 2 lớp gờ trang cho bộ `>= 2` tập, tôn trọng `prefers-reduced-motion`) & `BookCard.tsx` (vệt nếp gáy sách `linear-gradient`).
  - Huy hiệu `★ 4.8` trên `ShelfCoverCard` & `ShelfDetailHero`, sắp xếp *"Đánh giá cao nhất"* (`rating_desc`) và đồng bộ state tức thì khi chấm sao mới.
  - `mask-image` mờ mềm 2 mép cho `EditorialBookStrip` & *Tiếp tục đọc*, đồng bộ `tilt-card`, micro-bounce (`.micro-pop`), pháo giấy nạp lười `src/lib/confettiBurst.ts` (hoàn thành 100% tập & mốc Streak `7 / 14 / 30` ngày), `document.startViewTransition` khi mở/đóng `ShelfDetailView` và đọc `?shelf=` sau đăng nhập + `history.replaceState` (chặn kệ không tồn tại hoặc `guest_locked`).
- **Rủi ro:** Gói entry `index-*.js` vượt trần `86.04 kB` gzip (`D-013`).
- **Giảm thiểu & Hoàn tác:** Đặt `coverAccentColor.ts` và `confettiBurst.ts` ngoài entry (chỉ nạp động/trong chunk lười), kiểm tra `npm run build` ngay cuối Phase 2. Hoàn tác bằng `git revert` commit Phase 2.

### Phase 3 — Nhóm 2: Trình đọc Chuyên sâu, Web Audio Soundscapes & Furigana (`0 B` entry)
- **Phạm vi:**
  - `src/lib/readerSoundscapes.ts` (**PA-A**: 3 bối cảnh nhạc nền Piano/Lofi + tiếng môi trường thật nối vòng lặp mượt tại `public/sounds/{night-rain,warm-study,sakura-wind}.m4a`, bỏ *Lò sưởi khuya* trùng lặp, `0` `three`, `0` CDN, `0 B` R2, âm lật trang nhẹ, Sleep Timer `15/30/60p` fade-out qua Web Audio `GainNode`, mặc định TẮT, tạm dừng/`suspend()` khi ẩn tab, `close()` khi đóng sách) + `src/components/ReaderSoundscapePopover.tsx`.
  - Bóng gáy sách giữa 2 cột & chuyển trang trượt mượt `220ms` cho `ReaderPaginatedView.tsx` & `GuestCanvasPaginatedView.tsx` (tôn trọng `prefers-reduced-motion`).
  - Thanh Dẫn Mắt (`Reading Ruler` / `Focus Paragraph`) làm dịu vùng xung quanh (~40% opacity) cho cả `ReaderView` DOM & `GuestCanvasReader` `<canvas>` (bảo toàn `D-028`), đồng bộ `user_reader_prefs`.
  - Tự động cuộn rảnh tay (`useReaderAutoScroll.ts` + `ReaderAutoScrollBar.tsx`, tốc độ `1–10`, `Space`/chạm tạm dừng, tự dừng cuối chương/mở modal) & vuốt dọc mép trái Mobile `<= 24px` chỉnh `nightDimPercent` (`0..50%` kèm HUD `%`, `useMobileLeftEdgeDimGesture.ts`).
  - Kéo đáy chuyển chương (`usePullToNextChapter.ts`) ở chế độ Cuộn dọc & hiển thị chuẩn `<ruby><rt><rp>` Furigana (`sanitizeHtml.ts`, `docxParser.ts`, `reader.css`, `guestPackBuilder.ts`, `guestCanvasLayout.ts`, `guestCanvasPaint.ts`).
- **Rủi ro:** Vuốt chỉnh độ tối xung đột với vuốt ngang lật trang hoặc kéo momentum cuối chương nhảy chương ngoài ý muốn.
- **Giảm thiểu & Hoàn tác:** Chỉ khoá cử chỉ độ tối khi `startX <= 24` và `|dy| > |dx| * 1.4`; chỉ kích hoạt kéo đáy chuyển chương khi chạm bắt đầu lúc đã đứng ở đáy chương. Hoàn tác bằng `git revert` commit Phase 3.

### Phase 4 — Nhóm 3: Command Palette (`Ctrl+K`), Mục tiêu & Wrapped, Bình luận v2
- **Phạm vi:**
  - `src/components/CommandPaletteModal.tsx` + `src/lib/commandPaletteSearch.ts` (`React.lazy`, `0 B` entry): mở thuần bằng phím tắt `Ctrl+K` / `⌘K` (không gắn thêm nút ngoài Header theo yêu cầu người dùng); tìm không dấu + `alt_titles` gom 6 nhóm (**Bộ truyện**, **Tập sách**, **Tác giả**, **Tuyển tập**, **Trích dẫn đã lưu**, **Thao tác nhanh**); ẩn lệnh Admin & giữ khoá `D-030` cho `guest`; điều hướng `↑ / ↓ / Enter / Esc` + `useBodyScrollLock`.
  - Mục tiêu đọc mỗi ngày (`dailyGoalMinutes`, vòng tròn tiến độ SVG hôm nay trong `ReadingStatsModal` qua `DailyGoalCard.tsx`) + `src/components/ReadingWrappedModal.tsx` (Tháng hiện tại / 90 ngày / Năm) + xuất PNG bằng Canvas 2D thuần (`src/lib/wrappedPosterCanvas.ts`, dùng font `Literata` & `Be Vietnam Pro`, thu hồi sạch `ObjectURL` & `ImageBitmap`).
  - Bình luận v2 (`communityApi.ts`, `useCommunityReviews.ts`, `CommunityReactionBar.tsx`, `CommunityCommentItem.tsx`, `CommunityReviewsSection.tsx`, `ReaderBookCommunityBlock.tsx`): sửa bình luận chính chủ (`(đã sửa)`), trả lời 1 cấp, gắn `chapterNumber` + tự che spoiler `Bình luận về Chương X — bấm để xem` khi `chapterNumber > chương đang đọc` theo `ReaderThemePalette`, và toggle 5 emoji (`🔥 😭 😂 ❤️ 🤯`).
- **Rủi ro:** Lộ nội dung kệ `restricted` trong Command Palette hoặc sai tương phản chéo theme trong Reader.
- **Giảm thiểu & Hoàn tác:** Chặn mở kệ/tập `guest_locked` ở Command Palette và dùng `ReaderThemePalette` xuyên suốt mọi nút/nhãn trong Reader. Hoàn tác bằng `git revert` commit Phase 4.

## 3. Checklist kiểm thử bắt buộc trước khi kết thúc (`AGENTS.md` §7)
- [x] `npm run typecheck` sạch 0 lỗi.
- [x] `npm run lint` sạch 0 lỗi / 0 cảnh báo, toàn bộ file `.ts`/`.tsx`/`.css` `<= 500` dòng hiệu dụng.
- [x] `npm run build` sạch lỗi, `dist/assets/index-*.js <= 86.04 kB` gzip (`85.39 kB` gzip), `0 B` `three` ở entry, `0` CDN ngoài.
- [x] `cd workers/r2-storage && npx tsc --noEmit` sạch 0 lỗi.
- [x] Kiểm thử `wrangler dev` + D1 local với migration `0016_community_v2.sql`: xác nhận `GET /api/books` trả `shelfRatings` (`QĐ-3 = 3B`), `GET/PUT /api/reader-settings` lưu `dailyGoalMinutes` & `readingRuler` (`QĐ-2 = 2A`), `POST/PATCH/DELETE` bình luận + trả lời 1 cấp (chặn cấp 2 `400`) + `PUT` reaction 5 emoji + dọn sạch reaction khi xoá bình luận/sách/kệ mồ côi + chặn `403` `D-030` + payload Discord `/?shelf=`.
- [x] Kiểm thử trình duyệt thật ở cả **Desktop (`1280×800`)** và **Mobile (`390×844`)**: kiểm tra trực quan 12 nhóm tính năng, `Ctrl+K` (không nút ngoài Header), Ambient Blur, Stacked Deck, Soundscapes, Thanh dẫn mắt đọc đơn & đọc đôi 2 cột, Auto-Scroll, vuốt mép trái chỉnh tối, Furigana, Wrapped PNG export (`1,434,689 B`), Bình luận v2, `0` lỗi Console/Page.
- [x] Đã cập nhật đầy đủ `docs/DECISIONS.md` (`D-039`), `docs/ARCHITECTURE.md` và `HANDOFF.md` (`< 60` dòng, không ghi hash commit).
