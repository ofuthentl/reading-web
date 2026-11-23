# Kế hoạch tổng thể — Nâng cấp Ofu's Library v2 (17 hạng mục)

- **Ngày lập:** 2026-11-23
- **Phạm vi bao gồm (17 hạng mục):**
  - **P0:** Thống kê thời gian đọc thực tế (Phương án 1: client active timer + gửi ghép vào `PUT /api/progress/:bookId` + `pagehide keepalive`) và nâng cấp `/usage` (vá lặp nhãn trục `0, 1, 1`, ghi chú khi trống, ưu tiên hiện độc giả/hoàn thành trước tên kệ, xổ chi tiết tủ sách theo thành viên Discord).
  - **Nhóm I — Trình đọc Light Novel:** Mục **1** (Popup Chú thích dịch giả), **2** (Tab Minh họa + chống spoiler), **3** (Nhảy & nhấp nháy đúng đoạn Tìm chữ), **4** (Ước tính thời gian đọc còn lại), **5** (Highlight bôi màu & Kho trích dẫn), **6** (Typography nâng cao), **7** (Đồng bộ `ReaderSettings` lên D1).
  - **Nhóm II — Quản lý Kho sách:** Mục **9** (Tên gọi khác `alt_titles`), **11** (Danh sách *Để dành đọc sau*), **12** (Gợi ý thông tin từ AniList), **13** (Bộ sưu tập tuỳ chỉnh *Custom Collections*).
  - **Nhóm III — Cộng đồng Discord:** Mục **14** (Bot Discord tự báo tập mới), **15** (Bình luận & Chấm điểm sao có `||Spoiler||`).
  - **Nhóm IV — Thói quen đọc & Tiện ích:** Mục **17** (Reading Streak & Lịch nhiệt 90 ngày), **18** (Quản lý Cache IndexedDB), **19** (Cài PWA nâng cao).
- **Đã loại theo yêu cầu người dùng:** Mục **8** (Chữ dọc Nhật *Tategaki*), **10** (Trạng thái bộ truyện), **16** (Góc Yêu cầu sách), **20** (3D Aincrad PR 4C).
- **Ràng buộc bất biến (`AGENTS.md` & `DECISIONS.md`):**
  - Chi phí vận hành **\$0** trên Cloudflare Free Tier, **0 CDN ngoài**, **0 byte R2 phát sinh** cho toàn bộ 17 hạng mục này (chỉ thêm bảng nhẹ trên D1).
  - Giữ entry 2D/mobile siêu nhẹ (nạp lười qua `React.lazy` cho mọi panel/modal mới, bảo toàn `D-013`).
  - Bảo toàn tuyệt đối 4 lớp chống crawl `guest` (`D-028`), phân quyền bộ kín `restricted` (`D-030`) và chế độ tàng hình `/usage` (`D-035`).
  - Mọi file mã nguồn `<= 500` dòng (ESLint `max-lines`), thu hồi 100% `URL.createObjectURL`, không lưu dữ liệu lớn vào `localStorage`.

---

## 1. Các quyết định kiến trúc cần chốt trước khi code (`AGENTS.md` §4)

### QĐ-A: Chia thành 4 Wave (4 PR nối tiếp) thay vì gộp 1 PR khổng lồ
- **Phương án 1 (Khuyến nghị): 4 Wave / 4 PR nối tiếp**, mỗi Wave tương ứng 1 nhánh riêng + 1 file migration D1 gọn (`0011` → `0014`), chạy full kiểm định CI + trình duyệt rồi mới sang Wave tiếp theo.
  - *Điểm yếu:* Cần chạy migration & merge 4 lần (hoặc nếu bạn muốn deploy production 1 lần cuối sau khi hoàn tất cả 4 Wave trên các nhánh nối tiếp thì vẫn chỉ cần 1 lượt chạy migration cuối cùng).
- **Phương án 2:** Gộp toàn bộ 18 hạng mục (~55 file, 4 migration) vào 1 PR duy nhất.
  - *Rủi ro:* Khó soát lỗi, dễ đụng giới hạn context/diff, một lỗi nhỏ ở Wave cuối kéo chậm toàn bộ 3 Wave đầu.

### QĐ-B: Highlight bôi màu (Mục 5) ở chế độ `guest`
- **Phương án 1 (Khuyến nghị):** `Owner` bôi đen chọn câu tuỳ ý trên DOM (`Selection API`) + tô màu trực tiếp lên chữ; `Guest` giữ nguyên Canvas không cho bôi đen/copy chữ (`D-028`), thay bằng nút **"Lưu trích dẫn đoạn đang đọc"** (chọn 1 đoạn ngắn đang hiển thị theo `blockIndex` + 4 màu + ghi chú, **chặn copy clipboard**, hiển thị dải viền màu nhấn nhẹ cạnh đoạn trên Canvas & xem lại trong Kho trích dẫn riêng).
  - *Điểm yếu:* Khách đánh dấu ở mức từng đoạn ngắn thay vì từng chữ lẻ — đổi lại không tạo lỗ hổng copy text chống `D-028`.
- **Phương án 2:** Chỉ bật Highlight cho `Owner`, ẩn hẳn với `Guest`. *(Mất trải nghiệm cho bạn bè Discord).*

### QĐ-C: Kênh gửi thông báo tập mới lên Discord (Mục 14)
- **Phương án 1 (Khuyến nghị):** Dùng **Discord Incoming Webhook (`DISCORD_RELEASE_WEBHOOK_URL` qua `wrangler secret put`)** — ưu tiên nếu có, và hỗ trợ dự phòng `DISCORD_BOT_TOKEN` + `DISCORD_RELEASE_CHANNEL_ID`.
  - *Ưu điểm:* Tạo Webhook ngay trong cài đặt kênh Discord mất 15 giây, không phải sửa quyền Bot hay xin intent mới, hỗ trợ Embed có bìa + nút mở web; hoàn tác bằng 1 lệnh xoá secret.
  - *Điểm yếu:* Admin cần dán URL Webhook 1 lần duy nhất bằng `npx wrangler secret put DISCORD_RELEASE_WEBHOOK_URL` ở bước deploy Wave 4.
- **Phương án 2:** Chỉ dùng `DISCORD_BOT_TOKEN` + `DISCORD_RELEASE_CHANNEL_ID`. *(Cần kiểm tra quyền `Send Messages` + `Embed Links` của bot trên đúng kênh).*

### QĐ-D: Phạm vi cache của Service Worker cho PWA (Mục 19)
- **Phương án 1 (Khuyến nghị):** Service Worker siêu mỏng `public/sw.js` **chỉ cache tài sản tĩnh đã gắn hash** (`/assets/*.js`, `/assets/*.css`, `/assets/*.woff2`, icons) với `NetworkFirst` cho `index.html`, và **bỏ qua tuyệt đối (`return` không chặn)** mọi URL `/api/*`, `/usage`, `/locked`, `/entrance`, cross-origin Worker và dữ liệu sách.
  - *Điểm yếu:* Không đọc sách offline khi mất mạng (nhưng đúng ý đã chốt trước đây và 0% rủi ro rò rỉ sách Guest hay cache cũ trang `/usage`).

---

## 2. Lộ trình triển khai 4 Wave

### Wave 1 — Thời gian đọc, Streak 90 ngày, Vá `/usage` & Nâng cấp Lõi Trình đọc
- **Nhánh:** `feat/reading-time-streak-and-reader-ux` *(tách từ `origin/main`)*
- **Hạng mục:** **P0** + **Mục 17, 4, 6, 7, 3** (6 hạng mục; đã loại Mục 8 *Tategaki* theo yêu cầu người dùng)
- **Migration D1:** `workers/r2-storage/migrations/0011_reading_time_and_prefs.sql`
  - Thêm `owner_reading_seconds INTEGER NOT NULL DEFAULT 0`, `guest_reading_seconds INTEGER NOT NULL DEFAULT 0` vào `usage_daily_stats`.
  - Thêm `reading_seconds INTEGER NOT NULL DEFAULT 0` và `last_reading_sync_at INTEGER NOT NULL DEFAULT 0` vào `usage_daily_readers`; thêm `reading_seconds INTEGER NOT NULL DEFAULT 0` vào `reading_progress`, `guest_reading_progress`.
  - Tạo bảng `user_reader_prefs (user_scope TEXT PRIMARY KEY, settings_json TEXT NOT NULL, updated_at INTEGER NOT NULL)`.
- **Các Phase nhỏ trong Wave 1:**
  - **Phase 1.1 (Backend Worker):**
    - Cập nhật `progressDb.ts` nhận `readingDeltaSec` (kẹp trần an toàn `0..300s` và đối chiếu `updated_at` + ngân sách đồng hồ thực `last_reading_sync_at` trong `usageRecorder.ts` chống gian lận), cộng dồn vào `reading_progress` / `guest_reading_progress` và đẩy sang `usage_daily_stats` + `usage_daily_readers`.
    - Mở rộng `usageDb.ts` + `usageQueries.ts` trả thêm dữ liệu thời gian đọc theo ngày, tổng 7N/30N, giờ đọc theo từng tập & từng thành viên Discord, kèm endpoint `GET /api/admin/usage/guests/:discordUserId` trả toàn bộ danh sách tập 1 thành viên đã mở/đọc.
    - Thêm `GET /api/reading-stats/activity` (trả chuỗi 90 ngày gần nhất của chính `auth` đang đăng nhập cho Streak & Lịch nhiệt, cách ly tuyệt đối theo `reader_scope`).
    - Thêm `GET / PUT /api/reader-settings` (lưu/tải `ReaderSettings` theo `user_scope`, xác thực chặt từng trường).
  - **Phase 1.2 (Frontend Timer, `/usage` & Streak 90 ngày):**
    - Tạo hook `src/hooks/useActiveReadingTimer.ts`: chỉ đếm giây khi `visibilityState === 'visible'` và có thao tác cuộn/chạm/phím trong `90s` gần nhất; gửi ghép vào `saveReadingProgress` + `keepalive` khi `pagehide`/đóng sách.
    - Cập nhật `AdminUsageCharts.tsx`, `AdminUsageView.tsx`, `AdminUsageGuestTable.tsx` + `AdminUsageGuestDetailPanel.tsx`: thêm tab biểu đồ **`Thời gian đọc`**, cột giờ đọc theo khách/tập, **vá lỗi lặp trục Y `0, 1, 1`**, thêm dòng ghi chú thân thiện khi biểu đồ trống, ưu tiên hiện số độc giả/hoàn thành trước tên kệ, và xổ chi tiết tập đọc theo thành viên Discord.
    - Nâng cấp `ReadingStatsModal.tsx` (kèm helper `src/lib/readingStreak.ts` & `ReadingHeatmapSection.tsx`): hiển thị **Tổng giờ đọc**, **Chuỗi đọc liên tiếp (Streak hiện tại / kỷ lục)** và **Lịch nhiệt 90 ngày** SVG thuần (0 CDN, đồng bộ 4 theme).
  - **Phase 1.3 (Frontend Reader Core UX — Mục 4, 6, 7, 3):**
    - **Mục 4:** Helper `src/lib/readingEstimate.ts` tính thời gian đọc còn lại trong chương (~220 từ/phút tiếng Việt) hiển thị ở chân `ReaderView` & `GuestCanvasReader` qua `ReaderFooterStatusBar.tsx`.
    - **Mục 6 & 7:** Mở rộng `ReaderSettings` (`textAlign`, `paragraphIndent`, `paragraphSpacing`, `nightDimPercent`), đồng bộ D1 qua `src/lib/readerSettingsSync.ts` (cache tức thì ở `localStorage`, đồng bộ nền debounce `1.2s`), cập nhật `ReaderSettingsPopover.tsx`, `ReaderView.tsx`, `GuestCanvasReader.tsx` & `GuestCanvasPaginatedView.tsx`.
    - **Mục 3:** Nâng cấp `ReaderSearchAndBookmarks.tsx` + `ReaderView.tsx` + `GuestCanvasReader.tsx` + `readerSearchJump.ts`: bấm kết quả tìm chữ cuộn/lật tới đúng đoạn khớp và nhấp nháy sáng tạm thời `~2.2s` trên cả DOM lẫn `<canvas>`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Đồng hồ client gửi trùng khi chuyển chương nhanh hoặc mở nhiều tab → đã chặn bằng `consumeElapsedReadingDelta` ở client và ngân sách đồng hồ thực `last_reading_sync_at` ở server.
  - *Hoàn tác:* Các cột mới trên D1 đều `DEFAULT 0` (tương thích ngược 100%), có thể `git revert` PR mà không làm hỏng dữ liệu hiện có.

---

### Wave 2 — Chú thích dịch giả, Tab Minh họa & Highlight trích dẫn
- **Nhánh:** `feat/reader-footnotes-gallery-highlights` *(tách từ `main` sau Wave 1)*
- **Hạng mục:** **Mục 1, 2, 5** (3 hạng mục)
- **Migration D1:** `workers/r2-storage/migrations/0012_book_highlights.sql`
  - Tạo bảng `book_highlights (id TEXT PRIMARY KEY, user_scope TEXT NOT NULL, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, chapter_id TEXT NOT NULL, chapter_index INTEGER NOT NULL, chapter_title TEXT, quote_text TEXT NOT NULL, note TEXT, color TEXT NOT NULL, locator_json TEXT, created_at INTEGER NOT NULL)` + index `(user_scope, book_id, created_at DESC)`.
- **Các Phase nhỏ trong Wave 2:**
  - **Phase 2.1 (Mục 1 — Popup Chú thích dịch giả):**
    - Tạo `src/lib/epubFootnotes.ts` + `src/components/ReaderFootnotePopover.tsx`.
    - `Owner`: chặn click thẻ `<a href="#...">` là chú thích nội bộ (cùng chương hoặc chương cuối), trích đoạn chú thích sạch (đã qua `DOMPurify`) hiện ngay popup gọn trên trang.
    - `Guest`: tự nhận diện mẫu `[1]` / `(*)` đối chiếu dòng chú thích cuối chương ngay trên 263 `guest-packs` cũ + giữ thêm chỉ mục chú thích cho các gói mới trong `guestPackBuilder.ts`.
  - **Phase 2.2 (Mục 2 — Tab "Minh họa" & Chống spoiler):**
    - Worker: thêm `GET /api/guest/books/:bookId/illustrations` quét chỉ mục `{ mediaIndex, chapterIndex, chapterTitle, alt }` trực tiếp từ `guest-packs/<bookId>.pack` có sẵn (**0 cần re-pack 263 cuốn cũ**), bảo vệ qua `assertGuestBookAccess`.
    - Frontend: thêm tab thứ 4 **`Minh họa`** trong `ReaderTocDrawer.tsx` + component nạp lười `ReaderIllustrationGallery.tsx` (lưới ảnh toàn tập, công tắc **"Che ảnh chưa đọc tới"** mặc định BẬT, mở Lightbox & nút **"Tới chương này"**; với `Guest` vẽ `<canvas>` gắn thuỷ vân `D-028`, `0` thẻ `<img>` DOM).
  - **Phase 2.3 (Mục 5 — Highlight bôi màu & Kho trích dẫn):**
    - Worker: `highlightsDb.ts` + CRUD `GET/POST/PATCH/DELETE /api/highlights` (cách ly tuyệt đối `user_scope`, kiểm tra `assertGuestBookAccess`, tối đa `100` highlight/cuốn).
    - Frontend: thanh nổi chọn 4 màu + ghi chú cho `Owner` (DOM `Selection` + khôi phục `<mark>` khi mở lại chương), nút **"Lưu đoạn đang đọc"** (không mở copy text) cho `Guest`, và tab/modal **Kho trích dẫn** gom theo từng bộ truyện.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Khôi phục `<mark>` highlight có thể lệch vị trí nếu HTML có thẻ lồng phức tạp → dùng neo `quote_text` + chỉ số đoạn + offset dự phòng; tải nhiều thumbnail cùng lúc ở tab Minh họa Guest có thể chạm rate limit nếu dùng endpoint chapter → endpoint ảnh dùng giới hạn nhẹ/lazy intersection chỉ tải ảnh đang lọt khung nhìn.
  - *Hoàn tác:* Bảng `book_highlights` độc lập, `git revert` hoàn toàn an toàn.

---

### Wave 3 — Quản lý Kho sách thông minh, AniList & Tiện ích Thiết bị
- **Nhánh:** `feat/catalog-alt-titles-ptr-anilist-collections` *(tách từ `main` sau Wave 2)*
- **Hạng mục:** **Mục 9, 11, 12, 13, 18, 19** (6 hạng mục)
- **Migration D1:** `workers/r2-storage/migrations/0013_catalog_enhancements.sql`
  - Mở rộng `shelf_prefs` thêm `alt_titles_json TEXT`.
  - Tạo `user_plan_to_read (user_scope TEXT NOT NULL, shelf_key TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_scope, shelf_key))`.
  - Tạo `custom_collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)` & `collection_shelves (collection_id TEXT NOT NULL REFERENCES custom_collections(id) ON DELETE CASCADE, shelf_key TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (collection_id, shelf_key))`.
- **Các Phase nhỏ trong Wave 3:**
  - **Phase 3.1 (Backend Catalog + AniList Proxy):**
    - `PUT /api/shelves/alt-titles` (`Owner`), `PUT /api/plan-to-read` (`Owner` + `Guest`, cách ly theo `user_scope`), CRUD `/api/collections` (`Owner` quản trị, `GET` trả kèm trong `/api/books`), tự hợp nhất khi đổi tên/gộp kệ (`POST /api/shelves/rename`).
    - `POST /api/admin/anilist/search` (`Owner`): proxy gọn tới `https://graphql.anilist.co` tìm Light Novel (`type: MANGA, format: NOVEL`), làm sạch HTML mô tả và trả danh sách gợi ý (tác giả, tên Romaji/Anh/Nhật, tóm tắt, thể loại map sẵn sang 40 tag chuẩn `PRESET_SHELF_TAGS`).
  - **Phase 3.2 (Frontend Alt Titles, Plan to Read, AniList, Collections):**
    - Tích hợp `alt_titles` vào tìm kiếm (`libraryFiltering.ts`) + ô chỉnh tên gọi khác & nút **"Gợi ý từ AniList"** trong `ShelfBatchNoteModal` / `ShelfTagsModal`.
    - Nút **Để dành đọc sau** trên `ShelfCoverCard` / `ShelfDetailHero` + bộ lọc *Đọc sau* trên `LibraryCatalogView` & `AdvancedSearchPanel`.
    - Khu **Bộ sưu tập (Tuyển tập)** trên Tab Thư viện + modal `CollectionManagerModal.tsx` (nạp lười) cho Admin tạo/gán bộ vào tuyển tập.
  - **Phase 3.3 (Cache Manager Mục 18 & PWA Nâng cao Mục 19):**
    - Nâng cấp `src/lib/cache.ts` thêm hàm thống kê dung lượng từng cuốn/bìa và dọn từng mục/toàn bộ + modal nạp lười `CacheManagerModal.tsx` (chỉ hiển thị cho `Owner`).
    - Hoàn thiện `public/manifest.webmanifest` (đủ kích thước icon `192/512/maskable`, `apple-touch-icon` trong `index.html`), thêm `public/sw.js` cực gọn tuân thủ **QĐ-D** (chỉ cache vỏ tĩnh, bypass tuyệt đối `/api/*`, `/usage`, `/locked`, `/entrance`), đăng ký qua `src/lib/pwaRegister.ts`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Service Worker cache nhầm bản build cũ → dùng `NetworkFirst` cho HTML + tự kích hoạt `skipWaiting`/`clients.claim` theo phiên bản build; AniList API quá tải tạm thời → timeout `6s` và báo thông báo mềm không làm ảnh hưởng lưu tay.
  - *Hoàn tác:* Nếu SW gây sự cố có thể phát bản SW tự gỡ (`unregister`) và `git revert` sạch sẽ.

---

### Wave 4 — Cộng đồng Nhóm bạn Discord (Thông báo Tập mới & Bình luận/Đánh giá)
- **Nhánh:** `feat/discord-releases-and-comments` *(tách từ `main` sau Wave 3)*
- **Hạng mục:** **Mục 14, 15** (2 hạng mục)
- **Migration D1:** `workers/r2-storage/migrations/0014_comments_and_ratings.sql`
  - Tạo `library_ratings (target_type TEXT NOT NULL CHECK (target_type IN ('shelf','book')), target_key TEXT NOT NULL, user_scope TEXT NOT NULL, author_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), updated_at INTEGER NOT NULL, PRIMARY KEY (target_type, target_key, user_scope))`.
  - Tạo `library_comments (id TEXT PRIMARY KEY, target_type TEXT NOT NULL CHECK (target_type IN ('shelf','book')), target_key TEXT NOT NULL, user_scope TEXT NOT NULL, author_name TEXT NOT NULL, author_role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)` + index `(target_type, target_key, created_at DESC)`.
- **Các Phase nhỏ trong Wave 4:**
  - **Phase 4.1 (Mục 14 — Bot Discord tự báo tập mới):**
    - Worker: `discordRelease.ts` + `POST /api/admin/discord/announce-release` (`Owner`): kiểm tra bảng `shelf_access_rules`, **chặn cứng mọi kệ `restricted` (`D-030`)**, gom nhiều tập cùng 1 bộ thành 1 Embed đẹp gửi qua `DISCORD_RELEASE_WEBHOOK_URL` (hoặc fallback `DISCORD_BOT_TOKEN` + `DISCORD_RELEASE_CHANNEL_ID`).
    - Frontend: thêm ô tick **"Thông báo tập mới lên kênh Discord"** trong `UploadModal.tsx` (tự động ẩn/khoá kèm giải thích nếu kệ đang là `restricted`).
  - **Phase 4.2 (Mục 15 — Bình luận & Chấm điểm sao có `||Spoiler||`):**
    - Worker: `communityDb.ts` + `GET /api/community?type=shelf|book&key=...`, `PUT /api/community/rating`, `POST /api/community/comments`, `DELETE /api/community/comments/:id` (chống spam tối đa 1 bình luận/10 giây, kiểm tra quyền truy cập kệ `restricted`, Admin xoá được mọi bình luận, thành viên xoá bình luận của mình).
    - Frontend: bộ parse `||spoiler||` thuần React (0 `dangerouslySetInnerHTML`, 0 nguy cơ XSS) + component nạp lười `CommunityReviewsSection.tsx` gắn gọn dưới `ShelfDetailView.tsx` và cuối tập trong `ReaderView.tsx` / `GuestCanvasReader.tsx`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Lộ tên bộ kín `restricted` qua kênh chung Discord hoặc qua API bình luận → cả Frontend lẫn Worker đều chặn cứng dựa trên `shelf_access_rules`.
  - *Hoàn tác:* Xoá secret webhook nếu muốn ngắt thông báo ngay lập tức; bảng `library_ratings` & `library_comments` độc lập hoàn toàn.

---

## 3. Checklist kiểm thử bắt buộc cho từng Wave (`AGENTS.md` §7)

Trước khi chốt mỗi Wave:
1. **Kiểm định tĩnh:** `npm run typecheck`, `npm run lint` (`0` lỗi/cảnh báo, mọi file `<= 500` dòng), `npm run build` (kiểm tra entry `index-*.js` vẫn nhẹ, các tính năng mới nằm trong chunk nạp lười) và `cd workers/r2-storage && npx tsc --noEmit`.
2. **Kiểm định cục bộ thật:** Chạy migration mới trên D1 local (`wrangler d1 execute --local`), bật Worker + Vite, test trực tiếp bằng trình duyệt thật ở cả **PC & Mobile**, cả 2 vai trò **`Owner` & `Guest`**, kiểm tra không rò rỉ DOM/ảnh ở `Guest` (`D-028`), không lộ bộ `restricted` (`D-030`), không rò rỉ `/usage` (`D-035`).
3. **Đồng bộ sổ sách:** Cập nhật `HANDOFF.md` (`< 60` dòng), `docs/ARCHITECTURE.md` và `docs/DECISIONS.md` ngay trong cùng commit.
