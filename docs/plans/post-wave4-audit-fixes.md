# Kế hoạch: Vá lỗi tồn đọng toàn hệ thống hậu Wave 4 (Backend, Trình đọc, Mobile iOS, Giao diện 2D & 3D)

- **Ngày lập:** 2026-11-24
- **Nhánh làm việc:**
  - **PR 1 (Core / Backend / Reader / Mobile / 2D):** `fix/post-wave4-core-and-mobile` *(tách từ `feat/discord-releases-and-comments`; merge vào `main` sau khi PR Wave 4 vào `main`)*.
  - **PR 2 (Thế giới 3D WebGL):** `fix/library3d-audit-and-visuals` *(tách từ PR 1 hoặc `main` sau PR 1)*.
- **Phạm vi:** Vá toàn bộ **19 lỗi High**, **22 lỗi Medium** (đã loại `weeklyPopular` theo chốt giữ nguyên của người dùng, bổ sung **3 lỗi thực tế từ ảnh chụp Mobile/Tab Minh họa**) và các lỗi **Low** đáng chú ý.
- **Nguyên tắc bất biến (`AGENTS.md` & `DECISIONS.md`):**
  - Chi phí vận hành **\$0** Cloudflare Free Tier, **0 CDN ngoài** (`D-010`), **0 B R2 phát sinh** (`D-002`).
  - Bảo toàn `index-*.js <= 86.04 kB` gzip (`D-013`), **0 B** tài sản 3D ở entry 2D/mobile (`D-008`).
  - Bảo toàn toàn vẹn lớp chống crawl `D-028`, phân quyền bộ kín `D-030`, tàng hình `/usage` `D-035`, và giữ nguyên việc `weeklyPopular` tính cả bộ `restricted` theo xác nhận của người dùng.
  - Mọi file `<= 500` dòng hiệu dụng (ESLint `max-lines`), thu hồi 100% `URL.createObjectURL` / `ImageBitmap`.

---

## 0. Các quyết định kiến trúc cần chốt trước khi code (`AGENTS.md` §4)

### QĐ-1: Chiến lược tách PR (2 PR nối tiếp vs 1 PR gộp)

| Phương án | Mô tả | Rủi ro / Công sức | Khả năng hoàn tác | Điểm yếu |
|---|---|---|---|---|
| **1A (Khuyến nghị)** | Tách thành **2 PR nối tiếp**: **PR 1** (`fix/post-wave4-core-and-mobile`: Phase 1–4 — Backend Worker, Trình đọc, Parser, Mobile iOS, Giao diện 2D/PWA) và **PR 2** (`fix/library3d-audit-and-visuals`: Phase 5–6 — Toàn bộ lỗi 3D WebGL). | Thấp / Trung bình. Đưa bản vá bảo mật & mobile lên `ofu.lol` sớm, tách bạch rủi ro WebGL khỏi luồng đọc chính. | Rất cao (`git revert` độc lập từng PR). | Cần mở và merge 2 PR thay vì 1. |
| **1B** | Gộp cả 6 Phase (~55 file gồm Backend + 2D + 3D) vào 1 PR duy nhất. | Trung bình–Cao / Diff lớn, khó review và chậm đưa bản vá bảo mật + mobile ra production. | Trung bình (revert 1 phần phức tạp). | Một lỗi nhỏ ở 3D chặn cả bản vá Backend & Mobile. |

### QĐ-2: Chống cào ảnh `GET /api/guest/books/:id/media/:mediaIndex` & Chống reset Token Bucket qua đổi key Discord mỗi 15s (`D-028`)

| Phương án | Mô tả | Rủi ro / Công sức | Khả năng hoàn tác | Điểm yếu |
|---|---|---|---|---|
| **2A (Khuyến nghị)** | (1) Tại `auth.ts`: khi khách đổi key Discord mới, **không reset `rl_tokens = 10` và không xoá `rl_strikes = 0`** nếu vừa dùng gần đây — giữ nguyên trạng thái Token Bucket theo đồng hồ thực (chỉ tự reset `rl_strikes` sau 24 giờ yên ổn).<br>(2) Tại `/media/:mediaIndex`: trừ nhẹ **`cost = 0.2` token/ảnh** (dùng chung Token Bucket sẵn có, `trackStrikes = false` trên 429 đầu; `10` token burst = tải mượt tới **50 ảnh liên tục**, gấp 3–4 lần số tranh của 1 tập Light Novel) kết hợp giới hạn tải tối đa `3` thumbnail đồng thời ở `ReaderIllustrationGallery.tsx` (có nút thử lại mềm).<br>(3) Bật `trackStrikes = true` khi spam `429` liên tục ở `/illustrations` và `/search`. | Thấp / Nhỏ (~40 dòng, **0 cột D1 mới**, `\$0`). | Rất cao (`git revert` 3 file Worker + 1 file Gallery). | Nếu khách mở liên tục Tab Minh họa của 4–5 tập khác nhau trong dưới 1 phút có thể chạm chậm nhẹ `429` vài giây trước khi hồi token. |
| **2B** | Thêm 2 cột D1 riêng (`media_rl_tokens`, `media_rl_updated_at`) làm Token Bucket độc lập cho ảnh (burst 25 ảnh, hồi 1 ảnh/1s). | Trung bình / Vừa (cần migration thêm cột trên `discord_access`). | Trung bình (cột thừa ở D1). | Dư độ phức tạp SQL bảo trì cho quy mô thư viện cá nhân. |
| **2C** | Chỉ vá lỗi reset token 15s ở `auth.ts`, giữ nguyên `/media/:mediaIndex` không giới hạn tốc độ. | Rất thấp / Rất nhỏ. | Rất cao. | Vẫn để mở lỗ hổng cào song song toàn bộ tranh minh hoạ gốc & bắn tải CPU giải nén `deflate-raw` của Worker. |

### QĐ-3: Sửa lỗi tương phản chéo theme trong Trình đọc (`CommunityReviewsSection`, nút `Tới ↗` Tab Minh họa, `ReaderSettingsPopover`, `ReaderHighlightPopover`)

| Phương án | Mô tả | Rủi ro / Công sức | Khả năng hoàn tác | Điểm yếu |
|---|---|---|---|---|
| **3A (Khuyến nghị)** | Mở rộng `ReaderThemePalette` trong `src/lib/readerConfig.ts` thêm 4 token màu riêng cho Trình đọc (`accentText`, `accentBg`, `accentFg`, `surfaceSubtle` — nâu đồng `#84562e` trên `paper`/`sepia` và trắng ngà `#e6ebf0`/`#f2f2f4` trên `dark`/`midnight`) và thay toàn bộ `text-accent`, `bg-accent`, `accent-accent`, `dark:...` bên trong mọi component con của Trình đọc sang dùng `palette`. | Thấp / Nhỏ (~6 file UI). Đảm bảo tương phản chuẩn 100% ở cả **16 tổ hợp** (4 theme App × 4 theme Đọc). | Rất cao (`git revert`). | Cần rà đủ toàn bộ component con trong trình đọc để không bỏ sót class phụ thuộc `.dark` của App. |
| **3B** | Tự đổi `document.documentElement[data-theme]` tạm thời theo theme đọc mỗi khi mở sách. | Trung bình / Nhỏ. | Cao. | Gây nháy màu nền toàn trang lúc mở/đóng sách và dễ phát sinh xung đột trạng thái với `useTheme` (`B1`). |

### QĐ-4: Xử lý bản ghi mồ côi cấp kệ khi xoá hoặc chuyển hết tập cuối cùng của một kệ

| Phương án | Mô tả | Rủi ro / Công sức | Khả năng hoàn tác | Điểm yếu |
|---|---|---|---|---|
| **4A (Khuyến nghị)** | Tạo helper `cleanupOrphanShelves(db, candidateShelfKeys)` ở Worker: sau khi xoá sách (`DELETE /api/books/:id`, `bulk-delete`) hoặc đổi kệ (`PATCH /api/books/:id`, `bulk-shelf`), kiểm tra đúng các `shelf_key` vừa mất sách — nếu còn `0` cuốn trong `books` thì dọn sạch bản ghi mồ côi ở `shelf_prefs`, `shelf_access_rules`, `shelf_guest_grants`, `user_plan_to_read`, `collection_shelves`, `library_ratings (shelf)` và `library_comments (shelf)`. Đồng thời chuẩn hoá `.normalize('NFC')` thống nhất ngay trong `toShelfAccessKey()`. | Thấp / Vừa (~1 helper + gọi ở 4 mutation). Triệt tiêu triệt để kệ ma trên `/usage`, `planToRead`, `collections` và tránh dính quyền/bình luận cũ khi tạo kệ trùng tên. | Cao (`git revert`). | Nếu Admin xoá sạch 100% tập của 1 bộ để upload lại từ đầu (thay vì giữ tạm 1 tập hoặc sửa trực tiếp) thì tag/bình luận cấp bộ sẽ bị dọn theo. |
| **4B** | Chỉ dọn `shelf_prefs` & `shelf_access_rules`, giữ lại `library_comments` / `library_ratings` / `user_plan_to_read`. | Thấp / Nhỏ. | Cao. | Vẫn giữ kệ ma trong `planToRead` / `collections` và tạo bộ trùng tên sau này sẽ hiện lại bình luận cũ. |

> **Xác nhận bất biến từ người dùng:** `weeklyPopular` **giữ nguyên** tính cả các bộ `restricted` (không sửa [weeklyPopular.ts](file:///d:/Code/project/workers/r2-storage/src/weeklyPopular.ts)).

---

## 1. Lộ trình triển khai từng Phase

### PR 1 — `fix/post-wave4-core-and-mobile` (Backend + Trình đọc + Parser + Mobile iOS + Giao diện 2D/PWA)

#### Phase 1 — Backend Worker: Bảo mật `D-030`/`D-028`, Chuẩn hoá NFC, Nguyên tử hoá Race Conditions & Dọn dữ liệu
- **Mục tiêu:** Vá sạch 2 lỗi High, 7 lỗi Medium (trừ `weeklyPopular`) và các lỗi Low ở `workers/r2-storage/`.
- **Migration D1:** `workers/r2-storage/migrations/0015_audit_indexes_and_cleanup.sql`
  - Thêm 2 index thiếu: `idx_highlights_book_id ON book_highlights(book_id)` và `idx_plan_to_read_books_book_id ON user_plan_to_read_books(book_id)`.
  - Cập nhật đồng bộ `workers/r2-storage/schema.sql`.
- **Các file sửa chính:**
  1. **Fail-closed `D-030` & NFC thống nhất:**
     - `workers/r2-storage/src/shelfAccessDb.ts`: chuẩn hoá `.normalize('NFC')` trong `toShelfAccessKey()`.
     - `workers/r2-storage/src/booksDb.ts` (`:195-199`) & `catalogEnhancementsDb.ts` (`:267-271`): bỏ `.catch()` fail-open trên `loadShelfAccessSnapshot` — nếu `auth.role === 'guest'` và D1 lỗi truy vấn quyền thì trả `503` (fail-closed) thay vì mở khoá toàn bộ kệ kín.
     - `workers/r2-storage/src/bookUploadRoutes.ts`, `shelfMutationsDb.ts`, `shelfTagsDb.ts`, `communityDb.ts`: chuẩn hoá `.normalize('NFC')` trước khi lưu `books.shelf` và mọi `shelf_key`.
  2. **Siết chống crawl `D-028` (`QĐ-2`):**
     - `workers/r2-storage/src/auth.ts`: giữ nguyên `rl_tokens` & `rl_strikes` khi đổi key Discord mới (chỉ hồi theo thời gian thực; reset `rl_strikes` nếu đã yên ổn > 24h).
     - `workers/r2-storage/src/guestPack.ts`, `guestRoutes.ts`: áp `consumeGuestRateToken(env.DB, auth, 0.2, false)` cho `GET /api/guest/books/:id/media/:mediaIndex` (có ghi nhận `rate_limit_hits` khi `429`).
     - `workers/r2-storage/src/guestIllustrations.ts` & `guestSearch.ts`: bật `trackStrikes = true` khi vượt rate-limit liên tục.
  3. **Tiếng Việt có dấu & Toàn vẹn dữ liệu D1/R2 (`QĐ-4`):**
     - `workers/r2-storage/src/usageDb.ts` & `usageQueries.ts`: bỏ `LOWER(TRIM(shelf))` của SQLite (lỗi chữ hoa tiếng Việt `Đ/Ă/Ê/Ô/Ơ/Ư`), nhóm trực tiếp bằng `toShelfAccessKey()` ở JS.
     - `workers/r2-storage/src/shelfMutationsDb.ts`: đồng nhất hoa/thường tên kệ đích khi gộp kệ; bỏ `.catch(() => undefined)` im lặng khi hợp nhất bảng phụ; kiểm tra sách tồn tại & thuộc kệ trong `upsertShelfCover`; thêm helper `cleanupOrphanShelves`.
     - `workers/r2-storage/src/booksDb.ts`: bổ sung dọn tường minh `book_highlights` khi xoá 1 sách / xoá hàng loạt; gọi `cleanupOrphanShelves` khi kệ hết sách.
     - `workers/r2-storage/src/communityDb.ts` & `catalogEnhancementsDb.ts`: xác thực kệ đích tồn tại trong `books` khi ghi `library_ratings` / `library_comments` / `user_plan_to_read` (chặn guest xả dòng rác kệ giả, kèm trần hợp lý).
     - `workers/r2-storage/src/bookUploadRoutes.ts` & `guestPack.ts`: xác minh D1 chưa commit trước khi rollback xoá object R2 (giống `handleBookFileUpload`).
  4. **Chống Race Condition & Lỗi mốc 00:00 UTC+7:**
     - `workers/r2-storage/src/rateLimitDb.ts`: chuyển `recordLoginFailure` sang câu `INSERT ... ON CONFLICT DO UPDATE` nguyên tử trong SQL + dọn dòng hết hạn > 7 ngày.
     - `workers/r2-storage/src/communityDb.ts`: chống spam bình luận song song bằng kiểm tra/ràng buộc chặt theo `user_scope`.
     - `workers/r2-storage/src/progressDb.ts` & `usageRecorder.ts`: thêm `AND last_reading_sync_at > 0` vá lỗi giao ngày UTC+7 và kẹp nguyên tử `reading_seconds` theo đồng hồ thực trong SQL `UPDATE` để bắn song song không nhân bội giây đọc.
  5. **Wave 4 `discordRelease.ts`:**
     - Bổ sung `escapeDiscordMarkdown()` cho tên bộ/tập/tác giả/thể loại.
     - Sửa `stripSeriesPrefix` yêu cầu ký tự phân cách (`[\s\-–—:|/]`) sau tên bộ (không cắt nhầm `"ReZero"` khi kệ tên `"Re"`).
     - Thêm xử lý HTTP `429` đọc `retry_after` (giới hạn retry ngắn an toàn) + giới hạn số nhóm mỗi lần gọi để tránh vượt trần 50 subrequest Workers Free Tier.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Câu SQL nguyên tử mới ở `rateLimitDb`/`usageRecorder` hoặc `cleanupOrphanShelves` có thể lỗi cú pháp SQLite/D1 nếu không test trực tiếp trên D1 local. **Biện pháp:** Chạy `wrangler d1 execute --local` + test E2E từng endpoint trên `wrangler dev`.
  - *Hoàn tác:* `git revert <commit-phase-1>` và re-deploy Worker. Migration `0015` chỉ thêm 2 index non-destructive, hoàn toàn an toàn khi rollback code.

---

#### Phase 2 — Lõi Trình đọc, Đồng bộ Tiến độ/Cài đặt & Bảo mật Parser EPUB/DOCX
- **Mục tiêu:** Vá các lỗi High/Medium về mất dữ liệu tiến độ, lệch theme cloud, XSS SVG, chết Footnote EPUB3 và lỗi parse EPUB/DOCX.
- **Các file sửa chính:**
  1. **Tiến độ & Thời gian đọc (`pagehide keepalive` + IDB):**
     - `src/lib/api.ts`: khi `options?.keepalive` là `true` ở Cloud Mode, khởi tạo `apiFetch(..., { keepalive: true })` **ngay lập tức (đồng bộ)** trước khi chạy `putLocalProgress` (IDB async); đồng thời đọc/giữ lại `readingSeconds` tích luỹ khi `deltaSec === 0` để không xoá trắng `readingSeconds` trong IDB.
     - `src/hooks/useActiveReadingTimer.ts`: flush ngay `pendingSecondsRef.current` khi `enabled` chuyển `true → false` (ví dụ khi mở Lightbox) để không mất tới 59s đọc.
  2. **Race Condition đồng bộ `ReaderSettings`:**
     - `src/hooks/useBookReader.ts`: tách `appTheme` khỏi dependency array của `useEffect` gọi `fetchRemoteReaderSettings` (dùng `appThemeRef`, chỉ tải từ D1 1 lần khi `authenticated` đổi sang `true`), tránh `GET` đè ngược theme mới trong cửa sổ debounce `1200ms`.
  3. **Bảo mật `sanitizeHtml.ts` & Parser EPUB/DOCX:**
     - `src/lib/sanitizeHtml.ts`: cấu hình `ADD_ATTR: ['epub:type', 'role']` giữ nguyên nhận diện Footnote EPUB3; lọc bỏ inline `style` nguy hiểm (giữ an toàn hoặc bỏ `position`, `z-index`, `url(...)`, `color`/`background` phá dark mode) và bổ sung hàm `sanitizeSvgMarkup(rawSvg)` bằng `DOMPurify` (`USE_PROFILES: { svg: true }`, chặn `<script>`, `on*`, `foreignObject`, `javascript:`) cho mọi tệp `.svg` trước khi tạo `blob:` URL.
     - `src/lib/parsers.ts`:
       - Sanitize nội dung `.svg` trước khi tạo `blob:` URL (`parsers.ts` & `docxParser.ts`).
       - Parse XHTML bằng `application/xhtml+xml` khi có thẻ tự đóng kiểu XML (hoặc chuẩn hoá `<title/>`, `<a .../>` trước khi parse `text/html`) tránh mất trắng chương.
       - Sửa `resolveZipPath` xử lý đúng đường dẫn bắt đầu bằng `/`; thêm tra cứu file zip không phân biệt hoa-thường + fallback đường dẫn `%20` nguyên bản cho `container.xml`, `rootFile`, `nav`, `ncx`, spine.
       - Bọc `try/catch` từng ứng viên bìa và gắn đúng `type` Blob trong `extractCoverAtUpload` (tránh cover SVG đầu danh sách làm chết cả vòng lặp).
       - Ưu tiên `nav[epub\\:type~="toc"]` trước `landmarks`.
     - `src/lib/docxXml.ts` & `src/lib/docxParser.ts`:
       - Đọc `word/footnotes.xml` / `word/endnotes.xml` (cơ bản) và nội dung `w:txbxContent`; hỗ trợ `colspan`/`rowspan` (`w:gridSpan`/`w:vMerge`) trong bảng.
       - Gọi `decodeURIComponent` trong `resolveDocxPath`; lưu `resolvedZipPath` thật khi cache ảnh tránh lệch case ở `guestPackBuilder`.
       - Sửa regex `tiêu đề` (bỏ `\b` ASCII) và siết `CHAPTER_HEADING_TEXT_RE` (yêu cầu số chương hoặc khớp chuẩn, tránh tách chương giả với câu `"Phần lớn..."`, `"Hồi đó..."`).
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Parse `application/xhtml+xml` nghiêm ngặt có thể lỗi ở EPUB fan-sub sai XML → bắt buộc kiểm tra `<parsererror>` và fallback ngay sang `text/html` (đã xử lý `<title/>`).
  - *Hoàn tác:* `git revert <commit-phase-2>`.

---

#### Phase 3 — Trình đọc UX: Tương phản Chéo Theme, 2 Lỗi Mobile iOS, Highlight, Tìm chữ, Chú thích, Minh họa & Phím tắt
- **Mục tiêu:** Sửa dứt điểm các lỗi hiển thị, điều khiển và thao tác trên cả PC & iPhone (gồm 3 lỗi trực quan từ 3 ảnh chụp của người dùng).
- **Các file sửa chính:**
  1. **Tương phản chéo theme (`QĐ-3`):**
     - `src/lib/readerConfig.ts`: thêm `accentText`, `accentBg`, `accentFg`, `surfaceSubtle`, `badgeOwner`, `badgeGuest` vào `ReaderThemePalette`.
     - Cập nhật `CommunityReviewsSection.tsx`, `CommunityCommentItem.tsx`, `ReaderIllustrationGallery.tsx` (sửa nút `Tới ↗` trắng mờ trên nền kem!), `ReaderSettingsPopover.tsx`, `ReaderHighlightPopover.tsx`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx` dùng 100% token của `palette` (loại bỏ `text-accent` / `bg-accent` / `accent-accent` / `dark:` lệch pha App).
  2. **2 lỗi Mobile iOS thực tế từ ảnh chụp:**
     - `src/components/ReaderHighlightPopover.tsx`: trên `< 640px`, kiểm tra `activeAnchor.y > vh * 0.45` → neo lên **đỉnh màn hình** (`top-[max(0.75rem,env(safe-area-inset-top))]`), còn bôi ở nửa trên thì neo đáy; thêm `select-none` cho khung popover (chỉ `select-text` cho `<input>`); đồng thời nâng lớp phủ `nightDimPercent` lên `z-[65] pointer-events-none` trong `ReaderView.tsx` & `GuestCanvasReader.tsx` để popover không sáng gắt khi đọc đêm.
     - `src/components/ReaderPaginatedView.tsx` & `GuestCanvasPaginatedView.tsx`: đổi `<footer>` thành `flex-nowrap` trên mobile, rút gọn nhãn nút (`< Trước` / `Sau >` dưới `sm`, giữ `< Trang trước` / `Trang sau >` từ `sm+`) và chỉ số trang gọn (`18/143 · Ch.9/13`) để 3 cụm luôn nằm trên 1 hàng cân đối ở mọi màn hình `>= 320px`.
  3. **Ổn định Lật trang 2 cột & Vị trí cuộn:**
     - `src/components/ReaderPaginatedView.tsx`: khi bấm `#anchor` trong chương, không gọi `scrollIntoView` làm hỏng `scrollLeft` của khung `overflow-hidden` — reset `scrollLeft = 0` và tính chỉ số trang chứa phần tử đích để chuyển trang chính xác; chỉ cho phép đánh dấu `completed = true` sau khi ảnh chương cuối đã tải xong hoặc có xác nhận đo ổn định; tách padding `immersiveHidden` không làm đổi `outerRef.clientHeight` để chấm dứt `ResizeObserver` thrashing ~12 lần/200ms (tương tự ở `GuestCanvasPaginatedView.tsx`); chặn swipe lật trang khi `touches.length > 1` (pinch-zoom) hoặc có text selection.
     - `src/components/ReaderView.tsx` & `GuestCanvasReader.tsx`: lưu & khôi phục `scrollRatio` khi đổi cỡ chữ/font/lineHeight/width/spacing hoặc xoay màn hình; huỷ khôi phục cuộn cũ khi có `searchTarget` và luôn reset `suppressSaveRef` trong cleanup; hỗ trợ bấm `<svg><image>` mở Lightbox ở Owner; sửa lệch padding `640–655px` trong `GuestCanvasReader.tsx`.
     - `src/lib/guestCanvasPaint.ts`, `guestCanvasPages.ts`, `guestCanvasLayout.ts`: vẽ vạch highlight/search trong biên an toàn (`Math.max(2, offsetX - 6)`) không bị xén mép trái trên mobile/cột trái; kẹp bề rộng dòng đầu khi `paragraphIndent: true` gặp từ dài không khoảng trắng.
  4. **Highlight, Tìm chữ, Chú thích & Minh họa:**
     - `src/lib/domHighlights.ts`: ưu tiên vị trí gần `locator.startOffset` nhất khi có từ trùng lặp; chèn khoảng trắng ảo qua ranh giới block/`<br>` khớp với `sel.toString()`; thêm `td, th, div` vào `LEAF_BLOCK_SELECTOR`.
     - `src/lib/readerSearchJump.ts`: chỉ fallback bỏ dấu khi **toàn bộ chương** không có khớp có dấu (đồng bộ với `ReaderSearchAndBookmarks.tsx`); bổ sung `div, th, h5, h6, figcaption, pre`.
     - `src/lib/epubFootnotes.ts`: ưu tiên tìm theo tên tệp đích trước khi quét các chương khác; thêm `decodeURIComponent` ở `extractChapterFootnotesForGuestPack`; nhận diện thêm `(1)`/`[a]`.
     - `src/components/ReaderIllustrationGallery.tsx` & `ReaderImageLightbox.tsx`: bỏ `watermarkLabel` thừa khỏi deps fetch mạng; hạn chế tải tối đa 3 thumbnail đồng thời (khớp `QĐ-2`); tạo `createImageBitmap(bitmap)` độc lập hoặc giữ ownership rõ ràng + kiểm tra `bitmap.width > 0` trước `drawImage` chống crash `InvalidStateError`; ẩn `chapterTitle` & khoá nút `Tới` khi ảnh bị che spoiler.
  5. **Phím tắt, Guest Copy trong ô nhập liệu & Đồng bộ Modal:**
     - `src/hooks/useReaderController.ts`: bỏ qua mọi phím tắt (`ArrowLeft`/`ArrowRight`/`M`/`B`/`F`) khi có bất kỳ `[role="dialog"]` hoặc popover đang mở; chuyển kiểm tra `if (isTyping) return;` lên **trước** nhánh chặn `Ctrl+C`/`Ctrl+X` của `guest` (và ở `GuestCanvasReader.tsx` cho phép copy/cut/contextmenu bên trong `input`/`textarea` để khách gõ & sửa bình luận bình thường).
     - `src/components/ReaderBookCommunityBlock.tsx`: tự chuyển focus vào modal khi mở để không bị `ArrowLeft` đóng modal.
     - `src/components/ReaderHighlightPopover.tsx`: gắn `Escape` cho `GuestParagraphHighlightModal` và reset `note`/`color` khi chuyển sang đoạn chưa có highlight; dùng capture + `stopPropagation()` cho `Escape` ở `ReaderHighlightPopover` & `ReaderFootnotePopover`.
     - `src/components/CommunityReviewsSection.tsx`: gọi `setSummary(null)` khi `targetKey` đổi, thêm `targetKeyRef` chống race khi request đang bay và kẹp an toàn `setSelectionRange` khi chèn `||Spoiler||` gần mốc 1500 ký tự.
     - `src/components/ReaderOverlaysHost.tsx` & `QuoteVaultModal.tsx`: đồng bộ xoá highlight của cuốn đang đọc ngay về `features.highlights` (gỡ `<mark>` tức thì) và truyền đủ `chapterIndex`/`scrollRatio` khi bấm *"Mở đọc"* trích dẫn.
     - `src/lib/bookmarksApi.ts` & `guestCrypto.ts`: hỗ trợ `AbortSignal` cho tìm kiếm & tải TOC Guest; sửa `highlightsApi.ts` Local Dev không cắt mất highlight thứ 101.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Sửa nhiều file trình đọc cùng lúc có thể ảnh hưởng ESLint `max-lines: 500` (nhất là `ReaderPaginatedView.tsx` 512 dòng thô, `GuestCanvasReader.tsx` 525 dòng thô) → giữ chuẩn tách helper sạch nếu cận 500 dòng hiệu dụng.
  - *Hoàn tác:* `git revert <commit-phase-3>`.

---

#### Phase 4 — Giao diện 2D, Quản trị, State Sync, Routing, PWA & CSS
- **Mục tiêu:** Vá sạch 6 lỗi High và toàn bộ lỗi Medium/Low ở cụm 2D, Routing, Admin, Cache, Upload Wave 4, PWA và CSS.
- **Các file sửa chính:**
  1. **Modal & Toast Stacking:**
     - `src/components/AdminProtectionModal.tsx` (`:160`): chuyển `setSyncing(false); setSyncProgress(null);` vào khối `finally` để bấm *Dừng đồng bộ* ở cuốn đầu không khoá chết modal.
     - `src/components/ToastContainer.tsx`: render qua `createPortal(..., document.body)` với `z-[90]` để luôn nổi trên toàn bộ 7 modal portal.
     - `src/components/ReadingStatsModal.tsx` & `QuoteVaultModal.tsx`: đặt `LazyQuoteVaultModal` ngang hàng bên ngoài thẻ `onClick={onClose}`, chặn `Escape` của modal cha khi modal con đang mở, và hỗ trợ truyền vị trí `(book, chapterIndex, scrollRatio)` vào `openBook` để bấm *"Mở đọc"* nhảy thẳng tới đoạn trích dẫn.
     - Tạo hook gọn `src/hooks/useBodyScrollLock.ts` khoá cuộn nền `body` cho các modal (đếm reference để hỗ trợ modal lồng nhau).
  2. **Routing & AuthGate:**
     - `src/App.tsx`: khi `authenticated === true` mà `gateRoute === 'locked' || gateRoute === 'entrance'` (do bấm Back), tự `replaceGateRoute('root')`.
     - `src/components/AuthGate.tsx`: cho phép tự động khôi phục phiên từ token còn hạn ở cả `/locked` và `/entrance`; khi F5 tại `/usage` gặp lỗi mạng/5xx thì chỉ hiện thông báo thử lại chứ **không** xoá token Admin (chỉ xoá khi `isAuthError(err)`).
  3. **Cache Manager & IndexedDB (`cache.ts`):**
     - `src/components/CacheManagerModal.tsx`: phát hiện `!isCloudMode` (Local Dev) → khoá nút xoá tệp sách gốc và ghi rõ đang ở chế độ Local Dev (tệp sách là bản gốc duy nhất).
     - `src/lib/cache.ts`: gắn `db.onclose` / `db.onversionchange` reset `dbPromise = null`, xử lý `request.onblocked`, chờ `tx.oncomplete` và ném rõ lỗi `QuotaExceededError` khi ghi sách Local Dev thất bại.
  4. **Upload lô & Thông báo Discord (Wave 4):**
     - `src/lib/shelfPlacement.ts`: siết ngưỡng tự động gom lô `inferBatchCommonShelf` (chỉ tự bật gom lô khi tối thiểu `>= 80%` và không có 2 bộ rõ ràng khác nhau cùng tồn tại, tránh kéo Bộ B vào kệ Bộ A khi tải 2 tập A + 1 tập B).
     - `src/components/UploadDropzone.tsx` & `src/lib/uploadBatchHelpers.ts`:
       - Không tự động bắn thông báo Discord khi người dùng bấm *"Dừng tải lên"* giữa chừng hoặc có tệp lỗi (chỉ tự gửi khi hoàn tất sạch, hoặc hiện nút thủ công gửi các tập đã lên).
       - Chia lô `uploadedBookIds` theo nhóm `<= 50` khi gọi `announceDiscordReleasesApi`.
       - Kẹp bộ đếm hiển thị tiến độ `Math.min(completed + 1, total)` (hết lỗi `4/3`).
       - Thêm `|| exceedsQuota` vào `disabled` của nút Tải lên.
  5. **State Sync, `legacyCoverSync`, `/usage` & `BulkSelectionBar`:**
     - `src/lib/shelfPrefs.ts` & `shelfAccessApi.ts`: giữ trường `access` khi đọc/ghi `localStorage`; dọn `shelfPrefs.covers` ở client khi chuyển sách sang kệ khác; đồng bộ Local Dev `renameShelfAll`/`deleteBooks` cho `ptr`/`collections`/`community`/`highlights`.
     - `src/hooks/useLibraryDataStore.ts`: thêm bộ đếm phiên bản per-key cho toggle *Đọc sau* / *Yêu thích* chống race click nhanh; dọn timer `1200ms` của `legacyCoverSync` khi unmount/logout.
     - `src/lib/legacyCoverSync.ts`: kiểm tra sách còn tồn tại trước khi `putLocalBook`, chỉ cập nhật trường `cover_key`/`cover_size` (không ghi đè metadata mới sửa / không hồi sinh sách đã xoá), và đẩy `ApiAuthError` về `onApiError`.
     - `src/components/AdminUsageView.tsx` & `AdminUsageCharts.tsx`: gắn `AbortController` cho nút *Làm mới*; reset `activeIndex` khi `series` đổi; rút gọn số trục Y (`10k`, `1.2M`) chống tràn mép trái.
     - `src/components/Library2DView.tsx`: tính `selectedVisibleCount` & `allSelected` theo đúng danh sách `filteredBooks` đang hiển thị.
  6. **PWA, Tailwind v3 & CSS:**
     - `public/sw.js`: bổ sung timeout `1.5s` cho `NetworkFirst` của `index.html` (khớp `docs/ARCHITECTURE.md`), bỏ gọi `skipWaiting()` ép ngay trong `install` khi đang có controller cũ để dùng đúng cơ chế `SKIP_WAITING` + không xoá cache chunk cũ làm gãy tab đang mở.
     - Sửa 3 class Tailwind v4 không tồn tại trên v3.4.1 (`backdrop-blur-xs` → `backdrop-blur-[2px]`, `shadow-xs` → `shadow-sm`, `py-0.2` → `py-0.5`).
     - `src/lib/mikuCursorAnimator.ts`: đưa nhóm `text` (`input`, `textarea`) lên ưu tiên trước `.cursor-pointer` / `label[for]` và cập nhật lại cursor khi nút hết `disabled`.
     - Tách gọn phần cursor/reader utilities của `src/index.css` (691 dòng → chia file `src/styles/reader.css` & `src/styles/cursors.css` import vào `src/index.css`) để mọi file CSS cũng gọn `<= 500` dòng.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Thay đổi `public/sw.js` cần test kỹ nâng cấp SW cũ → mới trên `vite preview` để không bị cache vòng lặp.
  - *Hoàn tác:* `git revert <commit-phase-4>`.

---

### PR 2 — `fix/library3d-audit-and-visuals` (Thế giới 3D Aincrad — cô lập 100% trong chunk 3D)

#### Phase 5 — WebGL Lifecycle, Sương mù, Vật lý & Camera 3D
- **Mục tiêu:** Vá 4 lỗi High của 3D (mất sương mù, rò VRAM GLB, mất vị trí Kirito khi lưu progress, hổng collider Tầng 3 + camera xuyên tường).
- **Các file sửa chính:**
  1. `WorldBiomeMesh.tsx` & `BossArenaMesh.tsx`: đưa `<color attach="background">` & `<fog attach="fog">` ra khỏi `<group>` (dùng Fragment `<>...</>`) để khôi phục 100% sương mù không khí; tránh chạy `buildWorldArchitectureGeometries` & `createShelfNameplateAtlas` khi đang ở Boss Room; dùng IBL tối ấm ánh đuốc cho `ColosseumBossArena`.
  2. `gltfLoader.ts`, `BossArenaMesh.tsx`, `AmbientNpcs.tsx`, `AnimatedPlayerGlb.tsx`, `WorldGlbActors.tsx`: duyệt mọi thuộc tính `THREE.Texture` trên material (bao gồm `specularColorMap`, `specularIntensityMap`), gọi `tex.image.close()` nếu là `ImageBitmap`, gọi `skinnedMesh.skeleton.dispose()` khi unmount, và bỏ `theme` khỏi `useMemo` re-clone `boss-battlefield.glb`.
  3. `PlayerRig.tsx`, `FantasyLibrary3D.tsx`, `useLibraryViewState.ts`: không rebuild `tower` / reset vị trí Kirito mỗi lần `progress` đổi (reset spawn theo `[floor.floorIndex, floor.isBossRoom]`); chỉ nhảy kệ khi người dùng chọn hoặc nhấn Enter trong `WorldQuickBar` thay vì giật mỗi phím gõ.
  4. `biomeBlueprints.ts`, `worldPhysics3d.ts`, `grandLibraryBuilder.ts`: bịt kín collider vùng `X ∈ ±(7.9..12), Z < -17.5` Tầng 3 và bổ sung collider cho các đạo cụ lớn (Torii, giếng đá, cầu thang xoắn, bàn đọc, Cửa Boss); giảm `CAMERA_MIN_DIST` xuống `0.32m` (< `RADIUS 0.42m`) chống camera xuyên tường/tủ sách.
- **Rủi ro & Hoàn tác:** Rủi ro thấp, `0 B` ảnh hưởng bản 2D/mobile; hoàn tác bằng `git revert <commit-phase-5>`.

#### Phase 6 — Tương tác 3D, Phím tắt, HUD Wave 1–4 & Texture PBR
- **Mục tiêu:** Vá các lỗi Medium/Low của 3D để 3D đồng bộ tính năng với 2D Wave 1–4 và sắc nét hơn.
- **Các file sửa chính:**
  1. `InteractiveStations.tsx`, `WorldFurnitureGlbs.tsx`, `DragonBossDoorGlb.tsx`: gắn `onClick` vào trực tiếp mesh 3D của bàn đọc/cửa Boss/cổng tầng (không chỉ vòng tròn dưới sàn).
  2. `PlayerRig.tsx`: bỏ qua phím tắt khi giữ `Ctrl`/`Meta`/`Alt`; thêm listener `pointercancel` và dọn timer `40ms` khi unmount.
  3. `App.tsx`, `Library3DOverlay.tsx`, `Library3DHost.tsx`, `ThemeToggle.tsx`, `CozyGameHud.tsx`: đồng bộ nhãn/hành vi `ThemeToggle` khi ở 3D (`noon → light`), truyền đủ nút quản trị Wave 1–4 (`Stats`, `/usage`, `CacheManager`, `Protection`) vào header 3D, đồng bộ `activeCollectionId` + nút *Xoá lọc* trên HUD 3D, giữ trạng thái đóng/mở minimap khi đọc sách (dùng CSS ẩn thay vì unmount).
  4. `worldMaterials.ts`: thiết lập `tex.repeat.set(...)` phù hợp cho `pbr-cobble`, `pbr-tile`, `pbr-stone` (hết giãn 1×1 mờ nhoè); chỉnh collider `Stormterror` & reset cursor khi pause.
- **Rủi ro & Hoàn tác:** Cô lập hoàn toàn trong `src/components/library3d/`; hoàn tác bằng `git revert <commit-phase-6>`.

---

## 2. Checklist kiểm thử bắt buộc trước khi xem là xong (`AGENTS.md` §7)

1. **Kiểm định tĩnh:**
   - `npm run typecheck` sạch `0` lỗi.
   - `npm run lint` sạch `0` lỗi / `0` cảnh báo (mọi file `<= 500` dòng hiệu dụng).
   - `npm run build` xanh, `dist/assets/index-*.js <= 86.04 kB` gzip (`D-013`), `0 B` tài sản 3D ở entry, `0` CDN ngoài.
   - `cd workers/r2-storage && npx tsc --noEmit` sạch `0` lỗi.
2. **Kiểm định Backend Worker (`wrangler dev` + D1 local):**
   - Test `D-030` với tên kệ tiếng Việt NFD (`Đao Kiếm` NFD) ở `PUT /api/plan-to-read`, `GET /api/collections`, `POST /api/shelves/rename` → chặn `403` chuẩn, không rò rỉ.
   - Test `D-028`: đổi key Discord sau 15s không reset `rl_tokens`/`rl_strikes`; bắn 60 request `/media/:idx` song song bị chặn `429` có `Retry-After`, trong khi lướt Tab Minh họa bình thường (15 ảnh) vẫn mượt `200 OK`.
   - Test `weeklyPopular`: vẫn giữ nguyên tính cả bộ `restricted`.
   - Test `DELETE /api/books/:id` cuốn cuối của kệ → xác nhận `book_highlights` và bản ghi cấp kệ mồ côi được dọn sạch, `/usage` đếm chuẩn tên kệ tiếng Việt hoa/thường.
   - Test `POST /api/admin/discord/announce-release` với tên có `*`/`_` và >5 bộ → không vỡ Markdown, tự xử lý `429`.
3. **Kiểm định Trình duyệt thật PC (`1280×800`) + Mobile (`390×844` mô phỏng iPhone):**
   - **Tương phản chéo theme:** Đặt App ở `Đêm khuya` (`midnight`) + mở Trình đọc nền `Giữa trưa` (`sepia`) và `Ban ngày` (`paper`) → kiểm tra nút **`Tới ↗`** ở Tab Minh họa, nút **`Gửi bình luận`**, badge tác giả, thanh trượt cài đặt và hộp bôi màu đều rõ nét 100%; thử đảo ngược (App sáng + Reader đêm khuya).
   - **2 lỗi Mobile iOS:** (a) Bôi chữ gần đáy màn hình `390×844` → hộp `Bôi màu & Lưu trích dẫn` tự lật lên đỉnh màn hình, không đè vùng chọn; (b) Mở chế độ Lật trang trên `390×844` → thanh chân trang `< Trước | 18/143 · Ch.9/13 | Sau >` nằm gọn 1 hàng cân đối.
   - **Reader & Parser:** Bấm `#anchor` trong Lật trang 2 cột không lệch ngang; đọc EPUB có `<title/>` và `epub:type="noteref"` hiển thị đúng chương & popup chú thích; đóng tab sau 35s đọc ở Owner Cloud mode kiểm tra request `keepalive` lên Worker; đổi App theme ở Cloud mode không bị giật ngược theme cũ.
   - **2D & Modals:** Dừng đồng bộ ở cuốn đầu trong `AdminProtectionModal` đóng được modal bình thường; đăng nhập xong bấm Back không kẹt `/locked`; toast trong `ShelfTagsModal` nổi rõ trên backdrop; `ReadingStatsModal` → `QuoteVaultModal` bấm nền/Escape chỉ đóng 1 lớp và nút *"Mở đọc"* nhảy đúng chương/vị trí trích dẫn; `UploadDropzone` dừng giữa chừng không bắn nhầm tin Discord.
   - **3D (PR 2):** Sương mù hiện rõ trên cả 4 tầng + Colosseum; đi ở Tầng 3 `X = ±10, Z = -18` không xuyên bục đá; áp lưng vào tủ sách xoay camera không xuyên tường; mở sách đọc lưu tiến độ rồi đóng không bị giật về spawn; chuyển 3D → 2D → 3D nhiều lần không tăng VRAM bất thường.
4. **Cập nhật sổ sách (`AGENTS.md` §7–8):**
   - Cập nhật `HANDOFF.md` (`< 60` dòng), `docs/ARCHITECTURE.md` và `docs/DECISIONS.md` (nếu chốt thêm ADR cho `QĐ-2` / `QĐ-4`) trong cùng commit.
