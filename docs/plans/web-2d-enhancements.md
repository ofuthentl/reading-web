# Kế hoạch Triển khai — Nâng cấp Toàn diện Giao diện & Trình đọc Web 2D (`feat/web-2d-enhancements`)

> **Nhánh triển khai:** `feat/web-2d-enhancements` (tách từ `origin/main` sau khi merge PR #10 `D-028`).
> **Quyết định kiến trúc:** **`D-029`** trong `docs/DECISIONS.md` (đã chốt `PA-1A` xếp theo từng Tập + thêm dải *Mới cập nhật* cùng format, `PA-2A`, `PA-3A`).
> **Trạng thái:** **Đã hoàn tất triển khai toàn bộ Phase 1 → 5** — sẵn sàng migrate D1 / deploy Worker & mở PR vào `main`.

---

## 1. Phạm vi & Nguyên tắc Bất biến

Triển khai **10 nhóm tính năng nâng cấp Web 2D** đã chốt với người dùng (loại trừ 3 mục: *Lật trang 2 cột*, *Text-to-Speech* và *Tải Offline chủ động*), kết hợp dải xếp hạng biên tập **"Thịnh hành tuần này"** (*Popular this week*):

1. **Cặp 2 dải thẻ biên tập ngang (`EditorialBookStrip`) trên Trang chủ 2D:** lấy cảm hứng nhịp điệu thị giác tạp chí sách (số thứ tự serif nghiêng mảnh `01..10` trên nền chuyển sắc đáy bìa `3:4`), nhưng **thiết kế 100% câu chữ tiếng Việt và chi tiết thị giác nguyên bản của Ofu's Library** (tuân thủ nghiêm `D-027`: 0 chữ Hán, 0 con dấu đỏ của TMW) cho cả hai mục:
   - **`Thịnh hành` *`tuần này`***: xếp hạng **trực tiếp từng Tập sách (`Book`)** có hoạt động đọc cao nhất 7 ngày qua trên D1 (`owner + guest`).
   - **`Mới cập nhật` *`gần đây`***: Top tập sách vừa đưa lên kệ gần nhất (`created_at DESC`) cùng một ngôn ngữ thiết kế.
2. **Quản lý tiến độ đọc nhanh:** nối hàm `clearReadingProgress()` đã có sẵn ra UI để **Bỏ khỏi Tiếp tục đọc / Đặt lại tiến độ** và thêm nút **Đánh dấu đã hoàn thành** 1 chạm.
3. **Xem Giới thiệu / Tóm tắt sách (`book.description`):** hiển thị mô tả bộ truyện ở khung Hero `ShelfDetailView` và modal xem nhanh chi tiết từng cuốn `BookInfoModal`.
4. **Đọc nối tiếp Tập kế tiếp (`Next Volume`) cuối sách:** nút chuyển thẳng sang tập tiếp theo trong cùng kệ ngay ở cuối chương cuối cùng của cả `ReaderView` lẫn `GuestCanvasReader`.
5. **Bộ lọc, Sắp xếp & Nhãn "Mới lên kệ":** lọc theo trạng thái đọc (`Tất cả` · `Đang đọc` · `Chưa đọc` · `Hoàn thành`), định dạng (`EPUB` · `PDF` · `DOCX`), đổi sắp xếp (`Mới tải lên` · `Đọc gần đây` · `Tên A–Z` · `Số tập`) và gắn huy hiệu `MỚI` cho sách mới thêm.
6. **Zoom ảnh minh hoạ (Lightbox) & Tìm chữ trong toàn bộ cuốn sách:** xem phóng to tranh màu Light Novel / bản đồ; tìm từ khoá xuyên các chương ngay trong ngăn Mục lục (bảo toàn 100% chống cào `D-028` với `guest`).
7. **Kẹp Dấu trang & Ghi chú ngắn (`Bookmarks`):** lưu nhiều mốc trang/đoạn tâm đắc trong 1 cuốn, đồng bộ D1 cách ly giữa `owner` và từng `discord_user_id` của `guest`.
8. **Chế độ Đọc tự ẩn thanh công cụ (`Immersive Mode`) & Phím tắt bàn phím 2D:** tự thu gọn Header khi cuộn đọc trên điện thoại; phím tắt `/`, `Ctrl+K` (tìm kiếm thư viện), `M` (mục lục), `B` (dấu trang), `F` (ẩn/hiện thanh công cụ).
9. **Cá nhân hoá an toàn cho phiên Bạn bè (`guest`):** cho phép `guest` bấm ⭐ ghim kệ yêu thích lưu riêng ở `localStorage` máy khách (không đụng `shelf_prefs` của Admin) và gắn nhãn rõ cho sách `EPUB`/`DOCX` chưa đồng bộ gói bảo mật (`!book.guest_ready`).
10. **Bảng Thống kê Đọc sách cá nhân trên 2D (`ReadingStatsModal`):** tổng hợp số tập đã đọc xong, số bộ đang theo dõi, tổng trang quy đổi và lịch sử đọc gần đây cho cả PC lẫn Mobile.

### Ràng buộc kỹ thuật bắt buộc
- **Ngân sách gói khởi đầu (`D-013`):** giữ `index-*.js <= 86.04 kB gzip`, `0 B` `three`. Mọi modal mới (`BookInfoModal`, `ReadingStatsModal`, `ReaderImageLightbox`) nạp lười qua `React.lazy`.
- **Trần dung lượng `9.0 GiB` R2 (`D-002`):** **0 byte phát sinh trên R2** (chỉ tái sử dụng ảnh bìa `covers/*` sẵn có và lưu dòng văn bản siêu nhỏ trên Cloudflare D1).
- **Bảo mật chống cào `D-028`:** ở chế độ `guest`, cả Lightbox phóng to ảnh lẫn Tìm kiếm trong sách đều **không bao giờ** lộ thẻ `<img>`, `blob:` URL hay văn bản chương thô ra DOM/API.
- **Giới hạn `<= 500` dòng/file (`AGENTS.md` §5):** tách component/hook con theo đúng trách nhiệm, đồng thời rút gọn `App.tsx`, `Library2DView.tsx`, `ReaderView.tsx` và `GuestCanvasReader.tsx` xuống dưới ngưỡng an toàn.

---

## 2. Ba Quyết định Thiết kế cần Chốt trước khi Code

1. **Cách xếp hạng dải "Thịnh hành tuần này" (`weeklyPopular`) — ĐÃ CHỐT `PA-1A` (xếp theo từng Tập + thêm dải Mới cập nhật cùng format):**
   - **PA-1A *(Đã chốt)*:** Tính trực tiếp trên Worker trong `GET /api/books` (`< 1 ms`, 0 bảng mới, 0 request phụ) bằng cách gộp hoạt động đọc **7 ngày gần nhất** của cả `owner` (`reading_progress`) và mọi thành viên Discord (`guest_reading_progress`) **trực tiếp trên từng Tập sách (`Book`)** (không gom theo bộ), tự động bù bằng tập đọc 30 ngày / tập mới tải lên nếu tuần đó chưa đủ tập. Hoàn toàn ẩn danh. Dùng chung component `EditorialBookStrip` cho cả **Thịnh hành tuần này** lẫn **Mới cập nhật gần đây**.
   - **PA-1B:** Chỉ tính cục bộ ở trình duyệt dựa trên `progress` của người đang mở *(yếu điểm: khách Discord mới vào chưa có tiến độ sẽ không thấy bảng xếp hạng chung của thư viện)*.
   - **PA-1C:** Tạo bảng log sự kiện riêng ghi mỗi lần lật chương *(yếu điểm: tốn hàng nghìn lượt ghi D1 không cần thiết)*.

2. **Lưu trữ Dấu trang & Ghi chú ngắn (`Bookmarks`):**
   - **PA-2A *(Khuyến nghị)*:** Tạo bảng nhẹ `book_bookmarks` trên Cloudflare D1 (`user_scope = 'owner'` hoặc `'guest:<discord_user_id>'`, tối đa `30` dấu trang/cuốn, `note <= 300` ký tự) kết hợp cache RAM phiên. Đồng bộ xuyên PC ↔ Điện thoại và giữ nguyên dấu trang cho bạn bè Discord ở các lần lấy key hôm sau.
   - **PA-2B:** Chỉ lưu `localStorage` trên trình duyệt *(yếu điểm: không đồng bộ giữa điện thoại và máy tính, mất khi xoá trình duyệt)*.

3. **Hành vi bấm Thẻ sách (`BookCard`) khi có thêm Tóm tắt sách (`book.description`):**
   - **PA-3A *(Khuyến nghị)*:** Giữ nguyên **bấm vào bìa sách = Mở đọc ngay 1 chạm** như hiện tại; bổ sung nút nhỏ `ⓘ` trên thẻ sách để mở `BookInfoModal` (xem tóm tắt, metadata, đánh dấu hoàn thành, đặt lại tiến độ), nút `×` gỡ nhanh trên thẻ ngang *"Tiếp tục đọc"*, và hiển thị sẵn mô tả bộ truyện trên khung Hero của `ShelfDetailView`.
   - **PA-3B:** Đổi hành vi bấm vào bìa thành mở `BookInfoModal` trước rồi mới bấm nút *"Đọc sách"* *(yếu điểm: tốn thêm 1 cú nhấp chuột mỗi lần chỉ muốn đọc tiếp)*.

---

## 3. Lộ trình 5 Phase, Rủi ro & Cách hoàn tác

### Phase 1 — Hạ tầng Worker & D1 (`weeklyPopular`, `book_bookmarks`, `guest chapter search`)
- **File tạo / sửa:**
  - Tạo `workers/r2-storage/migrations/0005_bookmarks.sql` & cập nhật `workers/r2-storage/schema.sql`.
  - Tạo `workers/r2-storage/src/bookmarksDb.ts` (`<= 190` dòng): CRUD `GET / POST / DELETE /api/books/:id/bookmarks` cách ly theo `auth.role` + `auth.userId`, tự khởi tạo bảng an toàn `CREATE TABLE IF NOT EXISTS`.
  - Sửa `workers/r2-storage/src/booksDb.ts`: bổ sung truy vấn tổng hợp `weeklyPopular` (Top 10 `bookId` trong 7 ngày gần nhất gom đại diện theo kệ + fallback mượt) trả kèm trong `GET /api/books`.
  - Sửa `workers/r2-storage/src/guestPack.ts` & `workers/r2-storage/src/index.ts`: thêm `GET /api/guest/books/:id/search?q=...` đọc gói `OFGP` trên Worker và **chỉ trả `{ chapterIndex, chapterTitle, matchCount }`** (0 đoạn trích văn bản thô, áp dụng kiểm tra phiên `guest` chống lạm dụng).
  - Cập nhật `src/types.ts` và tạo `src/lib/bookmarksApi.ts` (`<= 110` dòng).
- **Rủi ro & Giảm thiểu:** Chưa chạy migration thủ công trên D1 → dùng `ensureBookmarksTable()` tự khởi tạo bảng ở lần gọi đầu giống `0003`/`0004`.
- **Cách hoàn tác:** `git revert` commit Phase 1; phản hồi `GET /api/books` chỉ thêm trường tuỳ chọn `weeklyPopular` nên tương thích ngược 100%.

### Phase 2 — Dải xếp hạng Editorial "Thịnh hành tuần này", Bộ lọc / Sắp xếp & Tiện ích `guest`
- **File tạo / sửa:**
  - Tạo `src/components/WeeklyPopularSection.tsx` (`<= 210` dòng): dải thẻ bìa `3:4` tràn viền phong cách biên tập sách (tiêu đề serif `Thịnh hành` *`tuần này`*, số thứ tự nghiêng lớn `01..10` trên lớp phủ tối đáy bìa, tên sách + tác giả nổi trên bìa, hiệu ứng mờ mép phải & nút cuộn ngang mượt trên cả 3 theme Sáng/Chiều/Đêm).
  - Tạo `src/components/LibraryFilterBar.tsx` (`<= 190` dòng) & mở rộng `src/hooks/useLibraryViewState.ts`: lọc trạng thái (`all | reading | unread | completed`), lọc định dạng (`all | epub | pdf | docx`), chọn sắp xếp (`recent_upload | recent_read | title_asc | volume_desc`).
  - Tạo `src/hooks/useGuestLocalFavorites.ts` (`<= 85` dòng): lưu/đọc kệ yêu thích cục bộ `localStorage` riêng cho phiên `guest`, hợp nhất mượt vào danh sách kệ hiển thị của khách mà không gọi API sửa `shelf_prefs` Admin.
  - Cập nhật `src/components/BookCard.tsx` & `src/components/Library2DView.tsx`: gắn nhãn `MỚI` (upload `<= 7` ngày), nhãn báo sách chưa có gói bảo mật ở phiên `guest`, tích hợp `WeeklyPopularSection` và `LibraryFilterBar` (ẩn gọn `WeeklyPopularSection` khi người dùng đang gõ tìm kiếm/lọc sâu).
- **Rủi ro & Giảm thiểu:** `Library2DView.tsx` đang 460 dòng → tách `WeeklyPopularSection` và `LibraryFilterBar` giúp giảm số dòng của `Library2DView.tsx` xuống ~370 dòng.
- **Cách hoàn tác:** `git revert` commit Phase 2.

### Phase 3 — Giới thiệu Sách (`book.description`), Quản lý Tiến độ 1 chạm & Thống kê Đọc 2D
- **File tạo / sửa:**
  - Tạo `src/components/BookInfoModal.tsx` (`<= 260` dòng, `React.lazy`): hiển thị ảnh bìa, kệ, tác giả, định dạng, dung lượng, ngày tải lên, toàn bộ `book.description`, tiến độ hiện tại và 3 nút hành động (**Đọc sách**, **Đánh dấu đã đọc xong**, **Đặt lại tiến độ / Bỏ khỏi Tiếp tục đọc** qua `clearReadingProgress`).
  - Tạo `src/components/ReadingStatsModal.tsx` (`<= 250` dòng, `React.lazy`): thống kê tổng tập hoàn thành, số bộ đang đọc/hoàn thành, tổng trang quy đổi (tái sử dụng công thức chuẩn từ `bossRoomLayout3d.ts` tách sang helper thuần dùng chung để **không kéo `three` vào 2D**) và danh sách 8 cuốn đọc gần nhất.
  - Cập nhật `src/components/ShelfDetailView.tsx`, `src/components/LibraryHeader.tsx`, `src/components/BookCard.tsx` & `src/App.tsx`: hiện mô tả kệ (có thu gọn/mở rộng) trên Hero `ShelfDetailView`, nút `ⓘ` mở `BookInfoModal`, nút `×` gỡ nhanh trên thẻ ngang *"Tiếp tục đọc"*, và nút Thống kê trên `LibraryHeader`.
- **Rủi ro & Giảm thiểu:** Import nhầm file trong `library3d/` làm kéo chunk 3D vào 2D → tách hàm tính toán thuần sang `src/lib/readingStats.ts` (`0` import `three`), kiểm tra chặt bằng `npm run build`.
- **Cách hoàn tác:** `git revert` commit Phase 3.

### Phase 4 — Đọc nối tiếp Tập sau (`Next Volume`), Chế độ Immersive & Phím tắt 2D
- **File tạo / sửa:**
  - Tạo `src/lib/nextVolume.ts` (`<= 80` dòng): tìm cuốn kế tiếp hợp lệ trong cùng `shelf` dựa trên `sortBooksByTitle` & `extractVolumeNumber` (với `guest` chỉ gợi ý tập đã `guest_ready` hoặc `pdf`).
  - Tạo `src/components/ReaderChapterEndNav.tsx` (`<= 120` dòng): thanh điều hướng cuối chương dùng chung cho cả `ReaderView` và `GuestCanvasReader` (nút Trước / Hoàn thành cuốn này / **Đọc tiếp Tập kế →**).
  - Cập nhật `src/components/ReaderView.tsx`, `src/components/GuestCanvasReader.tsx`, `src/components/Library2DView.tsx`:
    - Tự thu gọn thanh Header trình đọc khi cuộn xuống (`immersiveHidden`), hiện lại khi cuộn lên hoặc chạm vùng trung tâm màn hình / bấm phím `F`.
    - Phím tắt `/` hoặc `Ctrl+K` nhảy tới ô tìm kiếm thư viện; `M` mở mục lục; `B` mở dấu trang; `F` ẩn/hiện thanh công cụ.
- **Rủi ro & Giảm thiểu:** `GuestCanvasReader.tsx` đang sát trần 500 dòng → tách `ReaderChapterEndNav.tsx` giúp giảm ngay ~55 dòng cho cả 2 trình đọc.
- **Cách hoàn tác:** `git revert` commit Phase 4.

### Phase 5 — Tìm chữ trong sách, Zoom Ảnh minh hoạ (`Lightbox`) & Dấu trang (`Bookmarks`)
- **File tạo / sửa:**
  - Tạo `src/components/ReaderImageLightbox.tsx` (`<= 230` dòng, `React.lazy`):
    - Chế độ `owner`: phóng to `1x → 3x`, kéo xem chi tiết ảnh minh hoạ trong chương.
    - Chế độ `guest`: vẽ `ImageBitmap` lên `<canvas>` phóng đại kèm lưới thuỷ vân `watermarkLabel` và khoá `toDataURL`/`toBlob` (`0` thẻ `<img>` DOM).
  - Tạo `src/components/ReaderSearchAndBookmarks.tsx` (`<= 280` dòng) gắn vào `ReaderTocDrawer.tsx`:
    - Tab **Tìm chữ**: `owner` quét tức thì trên `parsedBook.chapters` kèm đoạn trích ngắn in đậm từ khoá; `guest` gọi `GET /api/guest/books/:id/search` nhận danh sách chương có từ khoá + số lần xuất hiện.
    - Tab **Dấu trang**: kẹp vị trí chương + `scrollRatio` hiện tại kèm ghi chú ngắn, bấm nhảy tới đúng đoạn đã lưu, xoá dấu trang.
  - Nối sự kiện click ảnh trong `ReaderView.tsx` (event delegation trên `.reading-content img`) và trong `GuestCanvasReader.tsx` (kiểm tra toạ độ click trúng khối `image` của `ChapterCanvasLayout`).
- **Rủi ro & Giảm thiểu:** Click nhầm lề trái/phải khi định bấm phóng to ảnh → ưu tiên kiểm tra trúng ảnh trước khi xét `sideTapNavigation`.
- **Cách hoàn tác:** `git revert` commit Phase 5.

---

## 4. Checklist Kiểm thử Định nghĩa "Xong" (`AGENTS.md` §7)
- [x] `npm run typecheck`, `npm run lint` (`0` lỗi, mọi file `<= 500` dòng), `npm run build` (`index-*.js <= 86.04 kB gzip`, **`0 B` `three`** ở gói khởi đầu) và `npx tsc --noEmit` trong `workers/r2-storage` đều sạch 100%.
- [x] Dải **"Thịnh hành tuần này"** & **"Mới cập nhật gần đây"** hiển thị đúng phong cách biên tập trên cả 3 theme (`light`, `dim`, `midnight`), 0 chữ Hán/con dấu TMW, bấm mở sách mượt.
- [x] Lọc trạng thái / định dạng / sắp xếp, xem `book.description`, đặt lại tiến độ / đánh dấu hoàn thành, yêu thích cục bộ `guest` và bảng Thống kê đọc hoạt động chuẩn cho cả `owner` và `guest`.
- [x] Cuối sách hiện đúng nút **"Đọc tiếp Tập kế →"**, chế độ Immersive tự ẩn thanh công cụ, phím tắt `/`, `Ctrl+K`, `M`, `B`, `F` không xung đột khi đang gõ chữ trong ô input.
- [x] Zoom ảnh Lightbox, Tìm chữ trong sách và Dấu trang hoạt động mượt; ở chế độ `guest` đảm bảo **0 thẻ `<img>` / 0 văn bản chương lộ trên DOM hay JSON API**.
- [x] Cập nhật đầy đủ `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` và `HANDOFF.md` trong cùng commit từng bước.
