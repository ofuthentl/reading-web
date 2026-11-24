# Kế hoạch triển khai — Kiểm toán & Vá dứt điểm lỗi tồn đọng hậu v3 (`fix/post-v3-audit-fixes`)

> Nhánh thực hiện: `fix/post-v3-audit-fixes` (tách từ `origin/main` sau khi gỡ 3D `D-040`).
> Baseline đo trước khi sửa: `dist/assets/index-*.js = 83.85 kB` gzip (`<= 86.04 kB` của `D-013`), `useReaderImmersionTools-*.js = 29.47 kB` gzip (`105.08 kB` raw), Worker `tsc --noEmit` xanh `0` lỗi.
> Nguyên tắc bất biến: mọi tệp `<= 500` dòng hiệu dụng (ESLint `max-lines`), `0` CDN ngoài, `0 B` phát sinh trên R2, `$0` Cloudflare Free Tier, giữ nguyên 3 tệp untracked sẵn ở thư mục gốc ngoài Git, bảo toàn `D-028`, `D-030`, `D-035`, `D-037`, `D-038`, `D-039`, `D-040`.

---

## 1. Các quyết định không hiển nhiên — Chờ duyệt trước khi sửa code (`AGENTS.md` §4)

### QĐ-1 — Cơ chế hồi / giảm `rl_strikes` chống cào (`rateLimitDb.ts` & `auth.ts`, củng cố `D-038` QĐ-2 `2A`)

**Bối cảnh kiểm chứng trên code thật:**
- `workers/r2-storage/src/rateLimitDb.ts:36, 48` đang đặt `rl_strikes = CASE WHEN ? = 1 THEN 0 ELSE rl_strikes END` ngay sau **1 request thành công duy nhất** (`illustrations` 1.5s / `search` 3s / `chapter` 6s), vô hiệu hoá hoàn toàn mốc tự đóng phiên ở `10` strikes và `D-038` QĐ-2 (`2A`).
- Cột `rl_updated_at` hiện tại cập nhật trên **mọi request hợp lệ**, nên nếu chỉ dựa vào `now - rl_updated_at >= 24h` thì người đọc thật lỡ dính 1–2 strikes lúc sáng rồi đọc bình thường cả ngày sẽ không bao giờ giảm strike.

| Phương án | Cơ chế | Rủi ro / Điểm yếu | Công sức | Hoàn tác |
|---|---|---|---|---|
| **1A (Khuyến nghị)** | Thêm cột additive `rl_last_strike_at INTEGER NOT NULL DEFAULT 0` vào `discord_access` (migration `0017` + tự nâng cấp `ALTER TABLE` trong `ensureDiscordAccessTable`). Khi bị `429` (`trackStrikes = true`): tăng `rl_strikes + 1`, đặt `rl_last_strike_at = now`. Khi request thành công **không reset về `0`**, chỉ giảm bậc thang **`-1 strike` mỗi 30 phút yên ổn không vi phạm** (dịch `rl_last_strike_at += decayed * 30p`) và **reset sạch `0` khi yên ổn `>= 24 giờ`** (dùng chung công thức ở cả `rateLimitDb.ts` lẫn `auth.ts` khi đổi key mới, fallback `rl_updated_at` nếu `rl_last_strike_at = 0`). | Thêm 1 cột nhẹ trên `discord_access`; bot cực chậm chỉ cố tình gây 1 lỗi `429` mỗi 30 phút sẽ không tích strike (nhưng ở tốc độ đó bot vẫn bị chặn bởi bucket `1 chương/6s`, vô hại). | Thấp (~35 dòng SQL/TS + migration additive) | Rất dễ (`git revert`, cột additive không phá bản cũ) |
| **1B** | Không thêm cột DB; bỏ reset tại `rateLimitDb.ts`, chỉ reset `rl_strikes = 0` khi `now - rl_updated_at >= 24h` (yên ổn tuyệt đối 24h không mở chương nào). | Vì `rl_updated_at` đổi sau mỗi chương đọc hợp lệ, bạn bè đọc liên tục nhiều ngày sau khi lỡ bị 2–3 strikes sẽ mang strike đó mãi đến khi nghỉ đọc hẳn 24h, dễ bị đá phiên oan về sau. | Rất thấp (~8 dòng) | Rất dễ |
| **1C** | Không thêm cột DB; bỏ reset sau 1 request, reset `rl_strikes = 0` khi `rl_tokens` hồi đầy `10/10` (`>= 60s` không đọc). | Bot chỉ cần bắn 9 phát bị `429` → nghỉ 60 giây → bắn 1 phát hợp lệ là tẩy sạch 9 strikes về `0`, làm suy yếu đáng kể `D-038` QĐ-2 (`2A`). | Thấp (~10 dòng) | Rất dễ |

- **Khuyến nghị:** Chốt **`1A`** (chặn triệt để bot cào + không phạt oan người đọc thật).

---

### QĐ-2 — Đồng bộ số chương Owner vs Guest & `"Minh họa"` (index 0) cho Bình luận v2

**Bối cảnh kiểm chứng trên code thật:**
- `guestPackBuilder.ts:348-390` tách chương quá dài (`> 260` blocks) thành nhiều segment có `id` dạng `${origId}`, `${origId}-p2`, `${origId}-p3`... khiến `tocChapters.length` của Guest lớn hơn `parsedBook.chapters.length` của Owner → lệch số chương khi gắn nhãn & so sánh che spoiler.
- `epubChapters.ts:200-209` và `docxChapters.ts:109` có thể chèn mục `"Minh họa"` ở `index = 0`, khiến mục văn bản đầu tiên bị đánh `chapterIndex + 1 = 2`.
- **Điểm thuận lợi quan trọng:** Mọi `guest-packs` đã có sẵn trên R2 đều mang `id` gốc + hậu tố `-p2`/`-p3` (`guestPackBuilder.ts:385`), nên Client có thể ánh xạ ngược 100% về chương gốc bằng cách bỏ `/-p\d+$/` mà **`0` cần re-pack bất kỳ cuốn sách nào (`0 B` R2)**.

| Phương án | Cơ chế | Rủi ro / Điểm yếu | Công sức | Hoàn tác |
|---|---|---|---|---|
| **2A (Khuyến nghị)** | Xây helper thuần `buildCanonicalChapterNumbering(chapters)` gom mọi segment chung gốc (`id.replace(/-p\d+$/, '')`) thành **1 số chương gốc duy nhất** khớp 1-1 giữa Owner & Guest (`0` re-pack R2, `0` migration). Nếu mục gốc đầu tiên là `"Minh họa"` (và sách có `>= 2` mục gốc), `"Minh họa"` không chiếm số chương (`chapterNumber = null`, mặc định "Chung cả tập"), các mục nội dung sau đánh số `1..N`; dropdown `<select>` hiện rõ `"Phần X · <Tiêu đề chương>"`. `readerMaxChapterNumber` suy từ `highestChapterReached` (tôn trọng `completed`, `initialProgress.chapterIndex`, đỉnh phiên) quy đổi qua cùng bảng ánh xạ. | Các bình luận v2 vừa đăng trước bản vá này (nếu có) trên sách có `"Minh họa"` sẽ lệch 1 đơn vị (rất ít do v3 vừa merge). | Thấp–trung bình (~70 dòng + nối props) | Dễ (`git revert`, không đổi DB) |
| **2B** | Gom segment chung gốc `/-p\d+$/` như `2A` (đồng bộ 100% Owner ↔ Guest, `0` re-pack), **nhưng giữ nguyên đánh số `1..N` tính cả `"Minh họa"`**, đổi nhãn UI sang `"Phần X · <Tiêu đề>"` cho khớp nhãn `"Phần 1 / N"` ở đầu trang trình đọc. | Tương thích ngược 100% với mọi bình luận v2 cũ; nhược điểm là sách có `"Minh họa"` thì Chương 1 văn bản vẫn mang số `Phần 2`. | Thấp (~60 dòng) | Dễ |
| **2C** | Thêm cột `chapter_base_id TEXT` vào `library_comments` (migration mới), so sánh thứ tự `baseId` trong mục lục thay vì số nguyên `chapter_number`. | Phải đổi schema D1 + API + UI hiển thị khi chưa mở sách; phức tạp quá mức cần thiết. | Cao | Khó hơn (dính migration DB) |

- **Khuyến nghị:** Chốt **`2A`** (tự nhiên nhất cho người đọc vì `"Minh họa"` không chiếm Chương 1, khớp 100% Owner ↔ Guest không cần re-pack R2). Nếu bạn muốn khớp chặt tuyệt đối `1..N` với tiêu đề `"Phần 1 / N"` đang in ở đầu trang và giữ nguyên số của bình luận cũ thì chọn **`2B`**.

---

### QĐ-3 — Cách tính số liệu theo kỳ (`Tháng này` / `90 ngày` / `Năm nay`) cho `Ofu's Library Wrapped`

**Bối cảnh kiểm chứng trên code thật:**
- `usage_daily_readers` lưu thời lượng theo từng ngày `(day_key, reader_scope, reading_seconds)` (giữ `400` ngày theo `usageDb.ts:25`), nhưng **không** lưu tách theo từng `(day_key, book_id)`.
- `reading_progress` / `guest_reading_progress` chỉ lưu **tổng tích luỹ** (`reading_seconds`, `completed`, `updated_at`), không có `completed_at` riêng.
- Hiện `wrappedPosterCanvas.ts` đang gắn `completedBooks` & `readPages` **tổng toàn kho** và `longestStreakDays` **90 ngày** lên cả 3 tab kỳ, đồng thời dùng `cutoffMs = Date.now() - 31/90/366d` cộng `prog.readingSeconds` toàn thời gian vào `topShelves` (gây nghịch lý tổng 1 bộ trong tháng lớn hơn cả tổng giờ đọc của tháng).

| Phương án | Cơ chế | Rủi ro / Điểm yếu | Công sức | Hoàn tác |
|---|---|---|---|---|
| **3A (Khuyến nghị)** | (1) `readingActivityDb.ts` tận dụng ngay `dailyRowsRes` đã đọc từ đầu năm để trả thêm `monthLongestStreakDays` & `yearLongestStreakDays` chuẩn theo lịch `UTC+7` (`0` query D1 thêm, `0` bảng mới). (2) `wrappedPosterCanvas.ts` căn `periodStartMs` chuẩn theo **00:00 UTC+7 đầu tháng (`01/MM`) / 90 ngày / đầu năm (`01/01`)**; 3 chỉ số ngày (`Thời lượng đọc`, `Ngày tích cực`, `Chuỗi kỷ lục`) chuẩn xác 100% theo kỳ. (3) Thẻ thứ 4 hiện **`Hoàn thành trong kỳ`** (lọc tập `completed && updatedAt >= periodStartMs`, kèm chú thích gọn tổng kho) và chân trang ghi rõ **`Tích luỹ toàn kho: ~X trang · Y tập xong`**. (4) Top 3 bộ truyện lọc các bộ có hoạt động trong kỳ (`updatedAt >= periodStartMs`) và dán nhãn minh bạch **`tích luỹ X giờ`** (không giả mạo là giờ đọc riêng tháng đó). | Nếu 1 tập đã hoàn thành từ trước nhưng bạn vừa mở đọc lại trong tháng này (làm cập nhật `updatedAt`), tập đó vẫn được tính vào danh sách hoạt động / hoàn thành gần đây của kỳ. | Thấp–trung bình (~90 dòng BE+FE) | Rất dễ (`git revert`, không đổi schema) |
| **3B** | Tách cứng giao diện & Poster Wrapped thành 2 khu: **Số liệu trong kỳ** (chỉ gồm Thời lượng, Ngày tích cực, Chuỗi kỷ lục, Biểu đồ 12 tháng) và **Hành trình toàn kho** (Tổng tập xong, Tổng trang, Top 3 bộ gắn bó nhất mọi thời đại — không lọc theo kỳ). | Trung thực 100%, 0 sai số ngữ nghĩa; nhược điểm là chuyển giữa `Tháng này` / `90 ngày` / `Năm nay` thì danh sách Top 3 bộ không đổi theo bộ vừa cày gần đây. | Thấp (~65 dòng) | Rất dễ |
| **3C** | Tạo bảng D1 mới `usage_daily_book_reads (day_key, reader_scope, book_id, reading_seconds)` + cột `completed_at` trên `reading_progress` / `guest_reading_progress`. | Nhân đôi lượt ghi D1 mỗi lần lưu tiến độ, **không có dữ liệu quá khứ** (Wrapped hiện tại sẽ trống trơn cho tới khi đọc mới từ đầu), độ phức tạp & rủi ro migration cao. | Cao | Khó |

- **Khuyến nghị:** Chốt **`3A`** (chính xác tuyệt đối cho các chỉ số theo ngày UTC+7, đổi kỳ sinh động, dán nhãn minh bạch cho chỉ số tích luỹ, `0` bảng mới, `0` D1 writes phát sinh).

---

## 2. Phân chia 3 Phase triển khai, Rủi ro & Cách hoàn tác

### Phase 1 — Backend Cloudflare Worker, D1, R2 & Discord (`workers/r2-storage/src/`)
1. **[HIGH] Vá lỗ hổng reset `rl_strikes` (`rateLimitDb.ts`, `auth.ts`, migration `0017` + `schema.sql` nếu chọn `1A`):**
   - Triển khai đúng phương án **QĐ-1** đã duyệt; bảo đảm `consumeGuestRateToken` không bao giờ xoá `rl_strikes = 0` sau 1 request thành công.
2. **[HIGH] Chặn bơm khống `reading_seconds` & sửa `readingDeltaAccepted` (`progressDb.ts`, `usageRecorder.ts`, `useReaderController.ts`):**
   - Bỏ cộng cứng `+3s` trong `progressDb.ts:177, 217` và `+2s` (`+ 2000`) trong `usageRecorder.ts:151, 173, 179`; kẹp nghiêm theo `CAST((now - prev_ts) / 1000 AS INTEGER)` (số giây đồng hồ thực trôi qua, bằng `0` khi `< 1000ms`), và trong `usageRecorder.ts` chỉ dịch `last_reading_sync_at` khi thực sự cộng `> 0` giây (`elapsed >= 1000ms`).
   - Trong `progressDb.ts` & `usageRecorder.ts`, bọc cặp `SELECT before` + `INSERT ... ON CONFLICT DO UPDATE ... RETURNING reading_seconds` trong **1 `db.batch([...])` nguyên tử** để tính chính xác `readingDeltaAccepted = Math.max(0, afterSec - beforeSec)` (chặn tuyệt đối race song song và truyền đúng số giây SQLite thực sự chấp nhận vào `scheduleUsageEvent`).
   - Tại `src/hooks/useReaderController.ts:72`: khi đang có `pendingProgressRef.current` sắp gửi đi, hạ `minSec` từ `5` về `1` để `pendingSecondsRef` đồng nhịp với `reading_progress.updated_at` (không tốn thêm request nào mà không bị rơi giây do cuộn liên tiếp).
3. **[MEDIUM] Dọn sạch `library_comments` khi xoá sách / `cleanupOrphanShelves` (`booksDb.ts`, `shelfMutationsDb.ts`, `communityReactionsDb.ts`):**
   - Tạo helper `deleteTargetCommentsSafely(db, targetType, targetKeys)` trong `communityReactionsDb.ts`: gọi `ensureCommunityTables` trước (hoặc chạy `DELETE FROM library_comment_reactions ...` độc lập có `.catch`), sau đó luôn thực thi `DELETE FROM library_comments ...` độc lập để lỗi bảng `library_comment_reactions` không bao giờ rollback lệnh xoá `library_comments`.
4. **[MEDIUM] Thống nhất chuẩn hoá NFC/NFD trong `shelfAccessDb.ts`:**
   - `assertGuestShelfAccess`: tra các rule `'restricted'` và so khớp chuẩn hoá qua `toShelfAccessKey(...)` (không bỏ sót bản ghi NFD cũ), kiểm tra `shelf_guest_grants` trên mọi `rawKey` khớp NFC.
   - `putAdminShelfAccessConfig`: thu thập tất cả `shelf_key` (cả NFC lẫn biến thể NFD cũ) khớp `toShelfAccessKey(shelfName)` trong `shelf_access_rules` & `shelf_guest_grants`, xoá sạch toàn bộ trong cùng `db.batch` (hết kẹt `'restricted'` khi chuyển `'public'`, đồng thời tự làm sạch về 1 khoá NFC duy nhất khi lưu `'restricted'`).
   - `getAdminShelfAccessOverview` & `prepareShelfAccessForRename`/`cleanupOldShelfAccessAfterRename`: hợp nhất rule & grants theo `toShelfAccessKey(...)`, khử trùng `discordUserId`.
5. **[MEDIUM] 3 lỗi bản vá Discord Release (`discordReleaseFormat.ts`, `discordRelease.ts`):**
   - Chạy `escapeDiscordMarkdown` cho `embed.title` (cắt raw trước khi escape và bảo đảm không cắt đứt `\` ở cuối chuỗi).
   - Cắt ngắn danh sách tag **trước khi** `escapeDiscordMarkdown` (tích luỹ từng tag trong ngân sách ký tự raw để không bao giờ để lại dấu `\` lẻ ở biên 240 ký tự).
   - Tại `discordRelease.ts:331-340`: đọc R2 cho `preferredCoverKey`; nếu trả `null` (thiếu / lỗi / `> 5 MB`) và có `uploadedCoverKey` khác thì tự fallback sang `uploadedCoverKey`.
6. **[LOW] Củng cố Worker:**
   - Thêm `idx_highlights_book_id` vào `ensureHighlightsTable` (`highlightsDb.ts`) và `idx_plan_to_read_books_book_id` vào `ensureCatalogEnhancementsTables` (`catalogEnhancementsDb.ts`).
   - `discordRelease.ts:113`: gọi `await obj.body?.cancel().catch(() => undefined)` khi `obj.size <= 0 || obj.size > MAX_COVER_BYTES`.
   - `discordRelease.ts:321`: nếu `grouped.size > MAX_GROUPS_PER_ANNOUNCE`, báo rõ số bộ bị cắt trong `message` (và trả kèm `truncatedGroups`).
   - `communityDb.ts`: giới hạn `repliesRes` bằng truy vấn theo danh sách `rootIds` + `LIMIT 500`; thêm điều kiện `EXISTS (SELECT 1 FROM library_comments WHERE id = ? AND target_type = ? AND target_key = ? AND parent_id IS NULL)` ngay trong câu `INSERT ... SELECT` reply (phân biệt rõ `404` mất bình luận gốc vs `429` cooldown); đồng thời áp dụng `Math.max(explicitChapter, inheritedChapter)` cho cả tạo reply (`POST`) và sửa reply (`PATCH`). Kiểm soát `communityDb.ts <= 500` dòng hiệu dụng (chuyển helper nhỏ sang `communityReactionsDb.ts` nếu sát trần).
   - `auth.ts`: nâng cấp `timingSafeEqual` thành `async` so sánh 2 digest HMAC-SHA-256 cố định 32 byte bằng `crypto.subtle.timingSafeEqual` (khởi tạo 1 key ngẫu nhiên ephemeral theo isolate).

- **Rủi ro Phase 1:** Sai cú pháp SQLite trên D1 local hoặc làm vỡ tiến độ đọc hợp lệ (kẹp quá gắt khiến `readingDeltaAccepted = 0` liên tục); `communityDb.ts` vượt 500 dòng hiệu dụng.
- **Giảm thiểu & Hoàn tác:** Chạy kiểm thử tự động trực tiếp trên `wrangler dev` + D1 local cho từng endpoint (`rateLimit`, `progress`, `delete book`, `shelfAccess` NFD, `community`, `discordRelease`); giữ mọi thay đổi DB hoàn toàn additive. Hoàn tác gọn bằng `git revert` commit Phase 1.

---

### Phase 2 — Trình đọc (DOM + Guest Canvas), Nhạc nền iOS, Furigana & Cử chỉ Mobile
7. **[HIGH] Furigana `<ruby><rt>` trên Guest Canvas (`guestCanvasMetrics.ts`, `guestCanvasLayout.ts`, `guestCanvasPaint.ts`, `guestPackBuilder.ts`):**
   - `guestCanvasMetrics.ts`: trong `justifyLineFragments`, giữ nguyên mọi fragment có `frag.rt` như 1 khối nguyên tử (tính đúng `rubyBoxW = Math.max(baseW, rtW + 2)` & căn giữa `padLeft`), không tách chuỗi hay xoá `rt`.
   - `guestCanvasLayout.ts`: dùng helper chung tính `rubyHeadroom` cho cả `'h'`, `'quote'`, `'list'` và `'p'` (với `'h'` tính theo `hSize`).
   - `guestCanvasPaint.ts`: vẽ `frag.rt` dùng `'serif'` khi `item.isHeading` khớp đo width ở layout.
   - `guestPackBuilder.ts:175-192`: tách chính xác từng cặp `(base, rt)` khi 1 `<ruby>` chứa nhiều cặp `<rb>/<rt>` (và nối có khoảng trắng hợp lý nếu nhiều `<rt>` liên tiếp thuộc chữ Latin/Việt).
8. **[HIGH] Sửa kéo đáy chuyển chương chết trên `GuestCanvasReader` (`GuestCanvasReader.tsx`, `ReaderScrollEnhancements.tsx`, `useReaderScrollGestures.ts`):**
   - Truyền cờ `scrollStageReady = showScrollStage` (`!loadingChapter && !chapterError && !isPaginated`) vào `ReaderImmersionChrome` → `usePullToNextChapter` để gắn lại listener đúng lúc `<GuestCanvasScrollStage>` mount lại sau khi tải chương xong.
9. **[HIGH] Sửa Highlight & Tìm chữ DOM gãy với `<ruby><rt>` (`domHighlights.ts`, `parsers.ts`, `readerSearchJump.ts`):**
   - Tạo helper dùng chung bỏ qua cây con `<rt>` và `<rp>` (tái sử dụng giữa `domHighlights.ts`, `parsers.ts`, `readerSearchJump.ts`, không viết trùng):
     - `domHighlights.ts`: loại `<rt>`/`<rp>` trong `buildNormalizedTextMap` và khi trích `quoteText`/`preRange` offset trong `captureOwnerSelectionDraft`.
     - `parsers.ts:402`: trích `plainText` bỏ `<rt>`/`<rp>` để tìm chữ & đếm từ chính xác.
     - `readerSearchJump.ts:83`: đọc text phần tử DOM bỏ `<rt>`/`<rp>`.
10. **[HIGH] Vá 4 lỗ hổng che Spoiler theo chương của Bình luận v2 (`CommunityCommentItem.tsx`, `communityDb.ts`, `ReaderView.tsx`, `GuestCanvasReader.tsx`, `GuestCanvasScrollStage.tsx`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`, `ReaderPaginatedFooter.tsx`, `useReaderBookFeatures.ts`):**
    - Worker `communityDb.ts`: `Math.max(explicitChapter, inheritedChapter)` cho reply (`POST` + `PATCH`).
    - `CommunityCommentItem.tsx`: khi `blurForChapterSpoiler === true`, ẩn luôn toàn bộ nhánh `replies` cho tới khi bấm `"Hiện"` (kèm thông báo số phản hồi ẩn).
    - `useReaderBookFeatures.ts` & các trình đọc: tính `readerMaxChapterNumber` thống nhất từ `highestChapterReached` (tôn trọng `initialProgress.completed`, `initialProgress.chapterIndex`, đỉnh phiên, reset khi đổi `bookId`) truyền đầy đủ xuống cả Cuộn dọc lẫn Lật trang (`ReaderPaginatedFooter`).
    - Áp dụng **QĐ-2** đã duyệt để đồng bộ số chương Owner vs Guest (`-pN` & `"Minh họa"`).
11. **[HIGH] Nhạc nền đọc sách trên iOS Safari & UX Popover (`readerSoundscapes.ts`, `ReaderSoundscapePopover.tsx`, `ReaderTopBar.tsx`, `useReaderController.ts`, `useReaderImmersionTools.ts`, `ReaderView.tsx`, `GuestCanvasReader.tsx`):**
    - `readerSoundscapes.ts`: gọi `ctx.resume()` khi `ctx.state !== 'running' && ctx.state !== 'closed'` (xử lý trạng thái `'interrupted'` đặc thù của iOS Safari).
    - Bắt lỗi `audio.play()` thông qua callback `onPlaybackError`: đồng bộ UI về `'off'` và hiển thị thông báo ngắn rõ ràng ngay trong `ReaderSoundscapePopover` khi trình duyệt chặn phát hoặc lỗi tải âm thanh.
    - Chặn vọt âm lượng khi bấm tắt giữa 12 giây fade-out của Sleep Timer: chỉ đặt `fadeMult = 1` khi `preset !== 'off'`.
    - Reset `sleepMinutes = 0` khi Sleep Timer hết giờ.
    - Đóng `soundOpen` khi bấm phím `Esc` hoặc khi `Immersive Mode` ẩn Header (cuộn xuống / phím `F`).
12. **[MEDIUM] Thanh dẫn mắt, Cử chỉ Mobile & Auto-scroll:**
    - `usePaginatedReadingRuler.ts`: phân biệt lần đo tạm vs khi trượt trang `220ms` hoàn tất (`transitionend` + fallback `245ms`), chỉ chốt `prevPageKeyRef` và tiêu thụ `pendingEdgeRef` khi đã ổn định; clamp rect vào `clipRect` xử lý chuẩn đoạn vắt giữa 2 cột.
    - `useDomReadingRuler.ts` & `GuestCanvasReader.tsx`: sửa điều kiện `maxScroll <= 0` để chương ngắn không bị làm mờ vĩnh viễn 38% bên dưới.
    - `ReaderTocDrawer.tsx`: thêm `role="dialog" aria-modal="true"` vào `<aside>` chặn cử chỉ vuốt mép trái & chặn phím `↑`/`↓`/`Space` điều khiển nền phía sau.
    - `useReaderScrollGestures.ts` & `GuestCanvasReader.tsx`:
      - Tách `touchcancel` khỏi `onTouchEnd` (chỉ reset, không nhảy chương).
      - Bỏ qua touch/wheel khởi phát trong `[data-community-section], button, input, select, textarea, a, [role="dialog"]`.
      - Hạn chế trackpad quán tính & chương ngắn (`maxScroll <= 0`) nhảy chương ngoài ý muốn (yêu cầu nghỉ nhẹ giữa đợt quán tính và ngưỡng cao hơn khi chương ngắn).
      - Dùng `chapterScrollRatioRef.current` trong `handleUpdateSettings` của `GuestCanvasReader.tsx` + `onUpdateDimRef` trong `useMobileLeftEdgeDimGesture` để không re-bind 4 listener `window` mỗi frame cuộn.
    - `useReaderImmersionTools.ts` & `useLibraryDataStore.ts`:
      - Auto-scroll tạm nhường tay khi người dùng chạm màn hình / lăn chuột (tạm ngưng cuộn khi đang giữ tay + ~700ms sau khi nhả), tự đặt `setAutoScrollPlaying(false)` khi `scrollContainerRef.current === null`, gỡ `setAutoScrollPlaying` ra khỏi updater của `setAutoScrollOpen`.
      - Gỡ `confettiBurst` dynamic import và `setShelfRatings` ra khỏi React state updater trong `useLibraryDataStore.ts` (dùng ref).
    - `ReaderScrollEnhancements.tsx`, `ReaderFooterStatusBar.tsx`, `ReaderPaginatedView.tsx`:
      - Thay `dark:bg-white/15` bằng `palette.isDark ? 'bg-white/15' : 'bg-black/15'`.
      - Hạ `ReaderNightDimOverlay` xuống `z-20` khi `settingsOpen || immersion.soundOpen` và nâng `MobileNightDimHud` lên `z-[65]`.
      - Reset `if (clipRef.current) clipRef.current.scrollLeft = 0` trong `commitPage` (và `measurePages`) của `ReaderPaginatedView.tsx`.

- **Rủi ro Phase 2:** `GuestCanvasReader.tsx`, `ReaderView.tsx`, `ReaderPaginatedView.tsx`, `guestCanvasPaint.ts` hiện đã ở khoảng 480–544 dòng raw (rất sát trần `500` dòng hiệu dụng ESLint); sửa cử chỉ có thể ảnh hưởng cuộn/bôi chữ trên mobile.
- **Giảm thiểu & Hoàn tác:** Tách helper gọn nếu bất kỳ tệp nào tiến sát 480 dòng hiệu dụng; kiểm thử trực tiếp trên trình duyệt Desktop + Mobile (`390×844`) cả DOM lẫn Canvas. Hoàn tác bằng `git revert` commit Phase 2.

---

### Phase 3 — Giao diện 2D, Wrapped PNG, Command Palette, Community UI & Tối ưu Bundle
13. **[MEDIUM] `useCommunityReviews.ts` & `CommunityReviewsSection.tsx`:**
    - Reset đủ 5 cờ busy (`savingRating`, `submitting`, `editingBusyId`, `reactingId`, `deletingId`) trong effect đổi target sách/kệ.
    - Gắn nền theo `palette.panelBg` + `colorScheme: palette.isDark ? 'dark' : 'light'` cho `<select>` chọn chương (chống chữ trắng nền trắng trên Windows Chrome Dark Mode).
14. **[MEDIUM] `wrappedPosterCanvas.ts`, `ReadingWrappedModal.tsx`, `ReadingStatsModal.tsx`, `Library2DDialogsHost.tsx`, `readingActivityDb.ts`:**
    - Vẽ bìa kiểu `object-cover` cắt trung tâm đúng tỉ lệ; ưu tiên bìa đại diện kệ (`shelfCovers`) / Tập 1 qua `pickShelfCoverBook` (truyền `shelfCovers` từ `App` → `Library2DDialogsHost` → `ReadingStatsModal` → `ReadingWrappedModal`).
    - Chủ động gọi `document.fonts.load(...)` đúng weight hiện có (`400`, `600`, `700` — bỏ weight `500` không có `.woff2`).
    - Áp dụng **QĐ-3** đã duyệt cho số liệu theo kỳ (`Tháng này` / `90 ngày` / `Năm nay`).
    - Gắn `window` keydown `Escape` trong `useEffect` của `ReadingWrappedModal.tsx`.
    - Kéo dài thời gian chờ trước `URL.revokeObjectURL` lên `45_000 ms` chống lỗi tải PNG trên iOS Safari.
15. **[MEDIUM] `App.tsx`, `CommandPaletteModal.tsx`, `useTheme.ts`, `bookMetadata.ts`, `shelfPlacement.ts`:**
    - `App.tsx`: thêm `setPaletteOpen(false)` vào cả 3 luồng đăng xuất (`handleLogout`), `401` (`handleApiError`) và hết phiên 24h (`closeExpiredDoor`).
    - `CommandPaletteModal.tsx`: tách effect tải `highlights` (`[open, books]`) khỏi effect reset `query` / `activeIndex` / focus (`[open]`).
    - `useTheme.ts`: bắt `.catch(() => undefined)` trên `transition.finished` và dùng bộ đếm tuần tự tránh xoá sớm `data-theme-switch` khi bấm đổi nền nhanh 2 lần.
    - `bookMetadata.ts`: thêm `.normalize('NFC')` trong `groupBooksIntoShelves` để khớp `toShelfPrefKey` (fix deep-link `/?shelf=` với tên kệ NFD).
    - `shelfPlacement.ts`: vá nhận diện đồng tác giả chứa `"và"` (không gộp nhầm `"Tác Giả A và Tác Giả B"` thành tiêu đề phụ) và siết regex số La Mã chuẩn `I..XX` (case-sensitive khi đứng độc lập, không bắt nhầm `"Tử Vi"`, `"Huyền Vi"`, `"mid"`, `"vivid"`...).
16. **[LOW] `ShelfFanStack.tsx`, `src/index.css`, tối ưu Bundle & Tài liệu:**
    - `ShelfFanStack.tsx`: reset `imgFailed` khi `book.cover_key` đổi; `src/index.css`: chuyển `will-change: transform` của `.shelf-fan-layer` vào trong `@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)`.
    - Tách các hàm upload-only (`inferBatchCommonShelf`, `resolveUploadShelfPlan`, `resolvePreviewShelfName` + helpers) sang `src/lib/shelfUploadPlanner.ts` (chỉ import trong chunk lười `AdminModalsHost` / `UploadDropzone` / `BulkShelfModal`) để hạ `index-*.js` entry; kiểm tra tách lười `ReaderTocDrawer` / `ReaderSettingsPopover` / `ReaderSoundscapePopover` trong chunk `useReaderImmersionTools` để giảm kích thước nạp lần đầu khi mở sách.
    - Cập nhật `docs/ARCHITECTURE.md` (sửa tên export `confettiBurst.ts` thành `triggerConfettiBurst`, ghi nhận module mới `shelfUploadPlanner.ts` và các thay đổi API/schema), cập nhật `docs/DECISIONS.md` (ghi nhận `D-041` cho QĐ-1/QĐ-2/QĐ-3) và cập nhật `HANDOFF.md` (`< 60` dòng, không ghi hash commit).

- **Rủi ro Phase 3:** Thay đổi regex `shelfPlacement.ts` có thể làm thay đổi cách tách tên của một vài tên file đặc biệt; tách module có thể gây circular import nếu không gọn.
- **Giảm thiểu & Hoàn tác:** Chạy bộ test hàm thuần kiểm chứng toàn bộ các ca tên file Light Novel Việt/Anh/La Mã/đồng tác giả (`Tử Vi`, `Quyển i`, `Unnamed Memory I`, `Tác Giả A và Tác Giả B`, `SS Tập 2`, `Black Bullet...`); xác minh `npm run build` sạch cảnh báo circular chunk. Hoàn tác bằng `git revert` commit Phase 3.

---

## 3. Checklist kiểm thử bắt buộc trước khi kết thúc (`AGENTS.md` §7–§8)

- [x] `npm run typecheck` sạch `0` lỗi.
- [x] `npm run lint` sạch `0` lỗi / `0` cảnh báo, mọi tệp `.ts`/`.tsx`/`.css` `<= 500` dòng hiệu dụng.
- [x] `npm run build` sạch lỗi, `dist/assets/index-*.js = 83.02 kB` gzip (`<= 86.04 kB`, giảm `-0.83 kB` so với `83.85 kB`), chunk trình đọc dùng chung giảm từ `105.08 kB` (`29.47 kB` gzip) xuống `68.16 kB` (`21.57 kB` gzip), `0` CDN ngoài.
- [x] `cd workers/r2-storage && npx tsc --noEmit` sạch `0` lỗi.
- [x] **Kiểm thử Worker + D1 local (Phase 1):**
  - [x] `rl_strikes` KHÔNG reset về `0` sau 1 request thành công; chạm `10` strikes tự đóng phiên (`401`); giảm `-1/30p` & reset sau `24h` yên ổn đúng theo **QĐ-1 (`1A`)**.
  - [x] Gửi liên tiếp nhiều `PUT /api/progress/:bookId` cách nhau vài ms không còn bơm khống `+3s`/`+2s`, `readingDeltaAccepted` khớp chính xác chênh lệch SQLite thực tế (`0s` khi spam, `3s` sau chờ thực tế).
  - [x] Xoá sách & `cleanupOrphanShelves` xoá sạch `library_comments` kể cả khi bảng `library_comment_reactions` chưa tồn tại.
  - [x] Dữ liệu `shelf_access_rules` NFD cũ vẫn bị chặn `403` ở `assertGuestShelfAccess`, hiển thị hợp nhất ở `GET /api/admin/shelves/access` và được dọn sạch khi chuyển lại `'public'`.
  - [x] Discord Release format: `embed.title` đã thoát Markdown, cắt tag trước khi escape không để `\` lẻ, bìa `cover_book_id` thiếu/quá `5 MB` trên R2 gọi `body.cancel()` & tự fallback sang bìa tập mới tải lên, báo rõ `truncatedGroups` nếu `> 20` bộ.
  - [x] Reply dùng `Math.max(explicitChapter, inheritedChapter)` trên cả `POST` & `PATCH`, kiểm tra `EXISTS` bình luận gốc ngay trong `INSERT`, `repliesRes` có `LIMIT 500`, và `timingSafeEqual` HMAC-SHA-256 chạy chuẩn cho `owner` & `guest`.
- [x] **Kiểm thử trình duyệt thật Desktop (`1280×800`) + Mobile (`390×844`) & Unit tests (Phase 2 & Phase 3):**
  - [x] Guest Canvas: Furigana `<ruby><rt>` bảo toàn qua `justifyLineFragments`, headroom cho heading/quote/list, tách đa `<rb>/<rt>` (`rubyText.ts`); kéo đáy chuyển chương gắn đúng khi `showScrollStage` bật (`scrollStageReady`).
  - [x] DOM Reader: Highlight & Tìm chữ hoạt động chính xác trên đoạn có `<ruby><rt>` (tìm `魔法 liên kết` khớp `1` kết quả); chương ngắn (`maxScroll === 0`) mang class `.reader-ruler-focus` không bị mờ 38% dưới; Thanh dẫn mắt 2 cột đợi `transitionend`/245ms; `clipRef.scrollLeft` reset `0` khi lật trang.
  - [x] Bình luận v2: bình luận vượt chương ẩn luôn toàn bộ nhánh replies cho tới khi bấm "Hiện"; không che oan người đã đọc xong / đọc lại; đồng bộ chương Owner vs Guest theo **QĐ-2 (`2A`)** (`Phần 1 · Chương 1...`, bỏ `"Minh họa"`); `<select>` chương có nền tối rõ chữ ở Dark Mode.
  - [x] Nhạc nền đọc sách: xử lý `'interrupted'` iOS Safari + lỗi phát rõ ràng; không vọt âm lượng khi bấm tắt giữa fade-out; tự reset `sleepMinutes = 0` khi hết giờ; `Esc` & `Immersive Mode` đóng `soundOpen`; `ReaderNightDimOverlay` không phủ tối đè Popover âm thanh hay HUD độ tối; TOC Drawer có `role="dialog" aria-modal="true"`.
  - [x] Wrapped PNG: ảnh bìa cắt `object-cover` ưu tiên bìa kệ/Tập 1, chủ động nạp font `400/600/700`, số liệu theo kỳ đúng **QĐ-3 (`3A`)**, phím `Esc` đóng modal sạch không kẹt, giữ ObjectURL `45s`, `0` lỗi Console/Page.
  - [x] `Ctrl+K` không bị xoá query khi nền cập nhật `books`, tự đóng khi logout/`401`/hết phiên; đổi nền nhanh 2 lần sạch `data-theme-switch`; deep-link `/?shelf=` khớp NFD; `shelfPlacement` nhận đúng đồng tác giả `"và"` và số La Mã chuẩn `I..XX`; Mobile `390×844` không tràn ngang (`0` lỗi Console/Page).
- [x] Cập nhật đầy đủ `docs/DECISIONS.md` (`D-041`), `docs/ARCHITECTURE.md`, `HANDOFF.md` (`< 60` dòng, không ghi hash commit) và tích xanh toàn bộ checklist trong file plan này trong cùng commit.
