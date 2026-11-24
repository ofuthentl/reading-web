# Kế hoạch triển khai v4 — Tủ Gáy Sách 2D, Phân quyền Tập/Chương, Trình đọc & Kho sách (`feat/v4-spine-shelf-and-catalog`)

> **Nhánh làm việc:** `feat/v4-spine-shelf-and-catalog` (tách từ `origin/main` sau PR #30 `D-040` & PR #31 `D-041`).
> **Mục tiêu:** Triển khai trọn bộ **8 hạng mục v4** đã điều chỉnh theo yêu cầu (`A1`, `A2`, `C12` *chỉ độ đậm chữ*, `C13`, `D15` *nửa sao + đọc lại, bỏ tạm ngưng*, `D16`, `D18`, và **D19 — Khoá / Phân quyền từng tập & từng chương cho Admin**) trên nền kiến trúc `$0` Cloudflare Free Tier, **0 CDN ngoài**, **0 B R2 phát sinh**, giữ nguyên tuyệt đối `D-028` (chống crawl `<canvas>`), `D-030` (cách ly nội dung bị khoá), ngân sách entry `index-*.js <= 86.04 kB` gzip (`D-013`) và mọi file `<= 500` dòng hiệu dụng.

---

## 1. Phạm vi tính năng (8 hạng mục)

| Mã | Hạng mục | Phạm vi cốt lõi | Phạm vi loại trừ rõ ràng |
|---|---|---|---|
| **A1** | **Tủ Gáy Sách 2D cải tiến (`Spine Bookshelf View`)** | Nút chuyển đổi 1 chạm trên Tab Thư viện giữa **`Lưới Bìa`** *(giao diện lưới bìa hiện tại đã có sẵn)* ↔ **`Tủ Gáy Sách`** *(kiểu xem mới thêm vô, nạp lười `0 B` entry)*; vật lý hộp sách cứng 90° chuẩn Light Novel Nhật (`preserve-3d`: gáy bên **PHẢI**, bìa 7:10 xoay ra bên **TRÁI**, thấy cạnh ruột giấy trái) đúng bản demo đã duyệt; Single Active Owner + hover-intent `40ms`; tự căn hàng bằng `ResizeObserver`; thanh gỗ kệ đồng bộ 4 chế độ nền; bìa thật + số tập + `★` + thanh `%`; thanh thông tin cố định dưới đáy. | Không dùng WebGL/Three.js (`D-040`); không giữ bản mở sang phải. |
| **A2** | **Hiệu ứng Ánh Kim / Phản Quang (`Foil Glint`)** | Lớp ánh kim ấm tinh tế trên bìa bộ yêu thích (`★`) hoặc bộ/tập đã hoàn thành `100%`, tái sử dụng hoàn toàn biến CSS `--gx`, `--gy`, `--glare-opacity` từ `useCardReveal.ts` (`0` JS mới, `0` re-render); tắt hoàn toàn khi `prefers-reduced-motion: reduce` và trên màn hình cảm ứng. | Không tạo hoạt ảnh tự chạy lúc nghỉ gây tốn pin/GPU. |
| **C12** | **Độ đậm chữ (`Font Weight`) trong Trình đọc** | **Chỉ thêm điều khiển độ đậm chữ** (`Thường 400` · `Vừa đậm 600` · `Đậm 700`) dùng bộ `.woff2` tự lưu trữ sẵn có (`Literata`, `Be Vietnam Pro`, `JetBrains Mono`), áp dụng đồng bộ trên cả `ReaderView` (DOM), `ReaderPaginatedView`, `GuestCanvasReader` và `GuestCanvasPaginatedView`, đồng bộ D1 qua `user_reader_prefs`. | **Không** thêm thụt đầu dòng (đã có) và **không** thêm Preset 1 chạm. |
| **C13** | **Tự học tốc độ đọc (`Adaptive WPM`) & Nhắc nghỉ mắt** | Tự học WPM cá nhân từ các phiên đọc thực tế (`EMA`, kẹp `120..450 WPM`, lưu `localStorage`, thay thế ngưỡng cứng `220 WPM` trong `readingEstimate.ts`, kèm nút đặt lại `220`); công tắc tuỳ chọn **Nhắc nghỉ mắt** (`Tắt / 30 / 45 / 60 phút` đọc liên tục, mặc định `Tắt`, đồng bộ `user_reader_prefs`) hiện thanh nhắc dịu mắt không chặn đọc. | Không khoá màn hình bắt nghỉ; không gửi thêm request D1 để đo WPM. |
| **D15** | **Chấm điểm nửa sao (`0.5★`–`5.0★`) & Đếm lượt `Đọc lại` (`Re-read`)** | Nâng cấp chấm sao bước `0.5` (`0.5★` → `5.0★`) tương thích ngược dữ liệu sao cũ; theo dõi số lần **`Đọc lại` (`Re-read`)** cấp Tập sách (cột `reread_count` đồng bộ D1 cho cả Owner & Guest) với nút *"Đọc lại từ đầu"* bảo toàn `readingSeconds` và hiển thị huy hiệu `↻ ×N`. | **Đã bỏ `Tạm ngưng (On-Hold)`** theo yêu cầu; không làm hỏng điểm sao & tiến độ cũ. |
| **D16** | **Gợi ý "Cùng gu trong kho" & Liên kết Bộ cùng Vũ trụ** | Dải *"Cùng gu trong kho"* (4–6 bộ cuối `ShelfDetailView`, chấm điểm client từ `shelfTags` + `authors`, `0` query D1, ẩn hoàn toàn kệ bị khoá với Guest); hệ thống **Liên kết Bộ cùng Vũ trụ** (*Phần tiếp theo* ↔ *Phần trước*, *Ngoại truyện / Spin-off* ↔ *Tuyến chính*, *Cùng vũ trụ*) do Admin quản lý trong D1, hiển thị ngay dưới `ShelfDetailHero`. | Không dùng thuật toán AI/server nặng; không lộ liên kết tới bộ bị khoá cho Guest (`D-030`). |
| **D18** | **Xuất Kho Trích Dẫn (`.md`) & Kiểm tra Sức khoẻ Kho sách (Admin)** | Nút **Xuất Markdown (`.md`)** trong `QuoteVaultModal` (**chỉ `owner`**, cấm `guest` giữ nguyên `D-028`, dùng `URL.createObjectURL` có `URL.revokeObjectURL`); bảng **Kiểm tra Sức khoẻ Kho sách** cho Admin (nạp lười `0 B` entry) kiểm tra 5 lỗi: thiếu `guest-pack`, thiếu ảnh bìa, thiếu tác giả/mô tả, bộ thiếu thể loại, nguy cơ trùng tên kệ (`NFC/NFD`/gần giống) kèm thao tác sửa 1 chạm. | Không mở xuất file `.md` cho `guest`; không chạy truy vấn D1 phụ nặng. |
| **D19** | **Khoá / Phân quyền từng Tập & từng Chương cho Admin (mở rộng `D-030`)** | Mở rộng hệ thống phân quyền 1 tầng (`Bộ truyện`) thành **3 tầng (`Bộ` → `Tập` → `Chương`)**: Admin khoá riêng từng tập (`inherit` / `restricted` / `public` đọc thử) và khoá riêng từng chương (hỗ trợ chọn thành viên Discord được đọc hoặc 0 người = Chỉ Admin, kèm nút nhanh *"Khoá từ chương này trở đi"* & *"Áp dụng danh sách thành viên cho các chương đã khoá"*). Worker chặn cứng `403` mọi điểm đọc/tìm kiếm/minh hoạ/ảnh/dấu trang/highlight trên tập & chương bị khoá với `0 B` re-pack R2. | Admin (`owner`) luôn có toàn quyền đọc & quản trị; không lộ nội dung, kết quả tìm kiếm hay ảnh minh hoạ của chương bị khoá cho Guest. |

---

## 2. Các quyết định kỹ thuật đã chốt (`1A, 2A, 3A, 4A, 5A` — ghi vào `docs/DECISIONS.md` mục `D-042`)

> **Trạng thái duyệt:** Người dùng đã chốt toàn bộ **5 quyết định** theo phương án khuyến nghị: **QĐ-1 = `1A`**, **QĐ-2 = `2A`**, **QĐ-3 = `3A`**, **QĐ-4 = `4A`**, **QĐ-5 = `5A`**. Không cần hỏi lại khi triển khai.

### QĐ-1 (D15): Schema D1 cho Chấm điểm nửa sao (`0.5★` → `5.0★`)
Hiện tại bảng `library_ratings` có `rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5)` trên D1 production.
- **PA-1A (Khuyến nghị):** Thêm cột additive `rating_half INTEGER CHECK (rating_half BETWEEN 1 AND 10)` (migration `0018` + auto-`ALTER` dự phòng). Lưu thang `1..10` vào `rating_half`, giữ cột `rating = MAX(1, MIN(5, ROUND(rating_half / 2.0)))` tương thích ngược, khi đọc dùng `COALESCE(rating_half / 2.0, rating)`.
  - *Rủi ro / Hoàn tác:* Thấp nhất (0 `DROP TABLE`, bản code cũ vẫn đọc cột `rating`).
  - *Điểm yếu:* Có 2 cột song song nên mọi query sao phải đọc qua `COALESCE`.
- **PA-1B:** Tạo bảng mới `rating REAL CHECK (rating >= 0.5 AND rating <= 5.0)`, copy dữ liệu rồi `DROP TABLE`.
  - *Điểm yếu:* Rủi ro cao trên D1 production, khó hoàn tác.

### QĐ-2 (D19): Quy tắc ưu tiên & cấu trúc phân quyền 3 tầng `Bộ → Tập → Chương`
- **PA-2A (Khuyến nghị — Ưu tiên tầng cụ thể hơn ghi đè tầng bao ngoài + chuẩn hoá theo `canonical chapter key`):**
  - **Cấp Tập (`book_access_rules` + `book_guest_grants`):** 3 chế độ `inherit` *(mặc định theo Bộ)* · `restricted` *(khoá riêng tập này, chỉ Admin + thành viên tick ở tập này)* · `public` *(mở công khai riêng tập này — cho phép mở đọc thử Tập 1 dù cả bộ đang khoá!)*.
  - **Cấp Chương (`chapter_access_rules` + `chapter_guest_grants`):** Khoá theo **`canonical_chapter_key`** (`chapter.id.replace(/-p\d+$/i, '')`) để mọi mảnh bị tách `-p2`, `-p3` của cùng 1 chương luôn bị khoá đồng bộ, hỗ trợ danh sách thành viên Discord riêng hoặc áp dụng nhanh cùng 1 danh sách cho tất cả chương bị khoá trong tập (0 thành viên = Chỉ mình Admin).
  - **Chặn rò rỉ toàn diện trên Worker:** `toc` gắn cờ `locked: true`; `chapters/:idx` trả `403`; `search` & `illustrations` bỏ qua hoàn toàn chương bị khoá; `media/:mediaIndex` kiểm tra chỉ trả ảnh có xuất hiện trong ít nhất 1 chương được mở (`403` nếu ảnh chỉ thuộc chương bị khoá, **0 B re-pack R2**); `bookmarks`/`highlights` trả `403` trên chương bị khoá.
  - *Rủi ro / Hoàn tác:* Chỉ thêm 4 bảng mới additive (`ON DELETE CASCADE` theo `books(id)`), không sửa dữ liệu `shelf_access_rules` cũ.
  - *Điểm yếu:* Khi 1 cuốn sách có bật khoá chương và khách chưa được cấp quyền tải ảnh `/media/:idx`, Worker phải quét nhanh gói text (~200–400 KB) để xác minh ảnh không thuộc chương bị khoá (chỉ tốn vài ms và chỉ chạy cho các cuốn thực sự có khoá chương).
- **PA-2B:** Chỉ cho phép khoá tập theo 2 mức (`inherit` / `restricted`) và chương chỉ khoá cứng `"Chỉ Admin"` (không cấp quyền cho từng thành viên Discord ở cấp chương).
  - *Ưu điểm:* Ít hơn 1 bảng (`chapter_guest_grants`), giao diện đơn giản hơn.
  - *Nhược điểm:* Không thể mở sớm chương mới dịch cho nhóm VIP/bạn thân trên Discord như bộ/tập, và không mở đọc thử được Tập 1 khi khoá cả bộ.

### QĐ-3 (D16): Lưu trữ Liên kết Bộ cùng Vũ trụ (`Related Series`)
- **PA-3A (Khuyến nghị):** Bảng chuẩn hoá riêng `shelf_relations (source_shelf_key, target_shelf_key, relation_type, created_at)` tự suy nhãn 2 chiều (*Phần tiếp theo* ↔ *Phần trước*, *Ngoại truyện* ↔ *Tuyến chính*, *Cùng vũ trụ* ↔ *Cùng vũ trụ*), tự gộp khi đổi tên kệ và lọc sạch liên kết chạm bộ bị khoá cho Guest.
  - *Điểm yếu:* Thêm 1 bảng mới và 1 file Worker gọn (`shelfRelationsDb.ts`).
- **PA-3B:** Lưu mảng JSON trong `shelf_prefs`.
  - *Điểm yếu:* Dễ lệch liên kết 2 chiều khi đổi tên/gộp/xoá kệ.

### QĐ-4 (A1): Chế độ xem mặc định của Tab Thư viện & hành vi Mobile
- **PA-4A (Khuyến nghị):** Giữ **`Lưới Bìa` (giao diện hiện có sẵn)** làm mặc định ban đầu, thêm nút chuyển 1 chạm sang **`Tủ Gáy Sách` (kiểu xem mới)** ở góc trên Tab Thư viện (ghi nhớ lựa chọn trong `localStorage`). Trên Mobile khi bật `Tủ Gáy Sách`: chạm lần 1 mở bìa sang trái + hiện nút `Mở kệ →`, chạm lần 2 vào bìa đang mở sẽ vào chi tiết bộ.
  - *Điểm yếu:* Người dùng phải bấm chuyển sang `Tủ Gáy Sách` 1 lần đầu tiên (nhưng sau đó trình duyệt nhớ luôn).
- **PA-4B:** Đặt **`Tủ Gáy Sách` (kiểu xem mới)** làm mặc định ngay khi mở Tab Thư viện (vẫn có nút chuyển về `Lưới Bìa` cũ).
  - *Điểm yếu:* Nếu bộ truyện có hàng trăm kệ trên điện thoại nhỏ, màn hình đầu tiên sẽ cần cuộn/chạm 2 bước.

### QĐ-5 (D18): Vị trí mở Bảng "Kiểm tra Sức khoẻ Kho sách" cho Admin
- **PA-5A (Khuyến nghị):** Modal nạp lười `AdminLibraryHealthModal` (`0 B` entry) trong `AdminModalsHost.tsx`, mở từ nút biểu tượng gọn trên `LibraryHeader` (chỉ Admin thấy) & lệnh `Ctrl+K` — bấm sửa sách/gộp kệ/đồng bộ bảo mật ngay tại chỗ.
  - *Điểm yếu:* Thêm 1 nút icon nhỏ trên thanh header của Admin.
- **PA-5B:** Gắn thành 1 tab phụ bên trong `/usage` (`AdminUsageView`).
  - *Điểm yếu:* Không sẵn modal sửa sách/đổi tên kệ ngay tại chỗ.

---

## 3. Lộ trình triển khai theo từng Phase

### Phase 1 — Backend Worker, Migration `0018` & Bảo mật 3 tầng (`Bộ` → `Tập` → `Chương`)
- **Mục tiêu:** Nâng cấp D1/Worker an toàn, tương thích ngược 100%, bịt kín mọi lỗ hổng khoá tập & khoá chương.
- **Tệp tạo mới / chỉnh sửa:**
  - `workers/r2-storage/migrations/0018_v4_catalog_ratings_and_access.sql` & `workers/r2-storage/schema.sql`:
    - `ALTER TABLE library_ratings ADD COLUMN rating_half INTEGER CHECK (rating_half BETWEEN 1 AND 10);`
    - `ALTER TABLE reading_progress ADD COLUMN reread_count INTEGER NOT NULL DEFAULT 0;`
    - `ALTER TABLE guest_reading_progress ADD COLUMN reread_count INTEGER NOT NULL DEFAULT 0;`
    - `CREATE TABLE IF NOT EXISTS shelf_relations (...)` + index `idx_shelf_relations_target`.
    - `CREATE TABLE IF NOT EXISTS book_access_rules (book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE, access_mode TEXT NOT NULL CHECK (access_mode IN ('public', 'restricted')), updated_at INTEGER NOT NULL);`
    - `CREATE TABLE IF NOT EXISTS book_guest_grants (book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, discord_user_id TEXT NOT NULL, granted_label TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (book_id, discord_user_id));` + index `idx_book_grants_user`.
    - `CREATE TABLE IF NOT EXISTS chapter_access_rules (book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, chapter_key TEXT NOT NULL, access_mode TEXT NOT NULL DEFAULT 'restricted' CHECK (access_mode = 'restricted'), updated_at INTEGER NOT NULL, PRIMARY KEY (book_id, chapter_key));`
    - `CREATE TABLE IF NOT EXISTS chapter_guest_grants (book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, chapter_key TEXT NOT NULL, discord_user_id TEXT NOT NULL, granted_label TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (book_id, chapter_key, discord_user_id));` + index `idx_chapter_grants_user`.
  - `workers/r2-storage/src/bookChapterAccessDb.ts` *(tạo mới)*:
    - Quản lý `book_access_rules`, `book_guest_grants`, `chapter_access_rules`, `chapter_guest_grants` kèm chuẩn hoá `toCanonicalChapterKey(chapterId)`.
    - `loadBookAccessSnapshot(db, auth)`: trả tập hợp `restrictedBookIds`, `publicOverrideBookIds`, `allowedRestrictedBookIds`, và bản tóm tắt `ownerBookAccess` (gồm cả `lockedChapterCount`) cho `GET /api/books`.
    - `resolveGuestBookLocked(...)` & `assertGuestBookEffectiveAccess(db, auth, bookId, shelfName)`.
    - `loadGuestLockedChapterKeysForBook(db, auth, bookId)` & `assertGuestChapterAccess(db, auth, bookId, chapterId)`.
    - API Admin (`requireOwner`): `GET /api/admin/books/:bookId/access` (trả danh sách chương từ `book_guest_packs.manifest_json`, luật khoá tập + danh sách thành viên, và luật khoá từng chương + danh sách thành viên) & `PUT /api/admin/books/:bookId/access` (lưu nguyên tử qua `db.batch`).
  - `workers/r2-storage/src/shelfAccessDb.ts`, `workers/r2-storage/src/booksDb.ts`, `workers/r2-storage/src/adminRoutes.ts`: nối kiểm tra tập bị khoá vào `assertGuestBookAccess()`, `listBooksAndProgress()` (trả `bookAccess` cho Owner, gắn `book.guest_locked` chuẩn 3 tầng cho Guest) và dọn bản ghi khi xoá sách (`deleteSingleBook`/`bulkDeleteBooks`).
  - `workers/r2-storage/src/guestPack.ts`, `workers/r2-storage/src/guestIllustrations.ts`, `workers/r2-storage/src/guestSearch.ts`, `workers/r2-storage/src/bookmarksDb.ts`, `workers/r2-storage/src/highlightsDb.ts`:
    - `getGuestBookToc`: gắn `locked: true` cho chương khách không được phép đọc.
    - `getGuestEncryptedChapter`: gọi `assertGuestChapterAccess` trả `403`.
    - `getGuestEncryptedMediaResponse`: khi sách có chương bị khoá với khách này, xác minh `mediaIndex` có mặt trong ít nhất 1 chương được mở (`403` nếu chỉ nằm trong chương bị khoá).
    - `getGuestBookIllustrations` & `searchGuestBookChapters`: bỏ qua hoàn toàn các chương bị khoá với khách.
    - `createBookBookmark` & `createHighlight`: gọi `assertGuestChapterAccess` chặn ghi đè trên chương bị khoá.
  - `workers/r2-storage/src/communityRatingsDb.ts`: auto-`ALTER` `rating_half`, nhận bước `0.5` (`0.5..5.0`), đọc `COALESCE(rating_half / 2.0, rating)`.
  - `workers/r2-storage/src/progressDb.ts`: auto-`ALTER` `reread_count`, lưu/trả `rereadCount`.
  - `workers/r2-storage/src/readerPrefsDb.ts`: whitelist `fontWeight` & `eyeBreakMinutes`.
  - `workers/r2-storage/src/shelfRelationsDb.ts` *(tạo mới)*, `workers/r2-storage/src/catalogEnhancementsDb.ts`, `workers/r2-storage/src/shelfMutationsDb.ts`: CRUD `PUT/DELETE /api/shelves/relations`, lọc sạch liên kết chạm bộ bị khoá cho Guest, tự gộp/dọn khi đổi tên/xoá kệ.
- **Rủi ro & hoàn tác:** Mọi cột/bảng mới đều có `CREATE TABLE IF NOT EXISTS` / auto-`ALTER` dự phòng nếu Worker deploy trước khi chạy migration; revert sạch bằng cách hoàn tác commit Phase 1.

### Phase 2 — Giao diện Thị giác (`A1` Tủ Gáy Sách 2D & `A2` Hiệu ứng Ánh Kim)
- **Tệp tạo mới / chỉnh sửa:**
  - `src/styles/bookshelf.css` *(tạo mới, nạp lười trong `SpineBookshelfView.tsx`)*: CSS hộp sách cứng 90° chuẩn Light Novel Nhật (gáy bên **PHẢI**, bìa 7:10 mở sang **TRÁI**, cạnh giấy trái, thanh gỗ kệ đồng bộ 4 nền, `prefers-reduced-motion`).
  - `src/styles/effects.css` *(tạo mới, ~30 dòng, nhập nhẹ ở `main.tsx`)*: CSS **A2 Foil Glint** tái sử dụng `--gx`/`--gy`/`--glare-opacity` từ `useCardReveal.ts`.
  - `src/components/SpineBookshelfSlot.tsx` & `src/components/SpineBookshelfView.tsx` *(tạo mới, nạp lười)*: chia hàng động `ResizeObserver`, Single Active Owner + hover-intent `40ms`, bìa thật `useCoverUrl` lazy theo hàng, điều hướng bàn phím + cảm ứng 2 chạm, thanh thông tin dưới đáy.
  - `src/components/LibraryCatalogView.tsx`: thêm nút chuyển `Lưới Bìa` ↔ `Tủ Gáy Sách`.
  - `src/components/ShelfCoverCard.tsx` & `src/components/BookCard.tsx`: gắn class `.cover-foil-card` cho bộ yêu thích / `100%` (bỏ qua nếu bị khoá).

### Phase 3 — Trình đọc (`C12` Chỉ Độ đậm chữ, `C13` Tự học WPM + Nhắc nghỉ mắt & UI Khoá chương cho Guest)
- **Tệp tạo mới / chỉnh sửa:**
  - `src/types.ts`, `src/lib/readerSettingsStorage.ts`, `src/styles/reader.css`, `src/lib/readingEstimate.ts`: thêm `fontWeight` (`'normal' | 'semibold' | 'bold'`), `eyeBreakMinutes` (`0 | 30 | 45 | 60`), `GuestTocItem.locked?: boolean`, `ReadingProgress.rereadCount?: number`.
  - `src/lib/guestCanvasMetrics.ts`, `src/lib/guestCanvasLayout.ts`, `src/lib/guestCanvasPaint.ts`: nạp font weight `600`, truyền `fontWeight` vào layout & vẽ Canvas, xoá `widthCache` khi đổi độ đậm chữ.
  - `src/lib/readingSpeedTracker.ts` *(tạo mới)*: tự học WPM bằng EMA (`120..450 WPM`, lưu `localStorage`, nút đặt lại `220`).
  - `src/hooks/useActiveReadingTimer.ts`, `src/hooks/useReaderController.ts`, `src/hooks/useReaderChapterProgress.ts`: theo dõi đọc liên tục cho Nhắc nghỉ mắt, ghi nhận mẫu WPM thực tế, bỏ qua chương bị khoá khi tự mở hoặc điều hướng `←`/`→` (hoặc hiển thị thông báo khoá rõ ràng).
  - `src/components/ReaderSettingsPopover.tsx`, `src/components/ReaderFooterStatusBar.tsx`: thêm mục **Độ đậm chữ**, **Nhắc nghỉ mắt**, hiển thị tốc độ đọc đã học & dải nhắc nghỉ mắt dịu nhẹ `ReaderEyeBreakBanner`.
  - `src/components/ReaderTocDrawer.tsx` & `src/components/GuestCanvasReader.tsx`: hiển thị ổ khoá `🔒` cạnh các chương bị khoá trong Mục lục; nếu khách mở trúng chương bị khoá thì hiện thẻ khoá lịch sự (không báo lỗi hệ thống chung chung) kèm nút chuyển sang chương mở gần nhất.

### Phase 4 — Cộng đồng, Hệ sinh thái Kho sách & Modal Khoá Tập/Chương (`D15`, `D16`, `D18`, `D19`)
- **Tệp tạo mới / chỉnh sửa:**
  - **D19 — UI Admin Khoá từng Tập & từng Chương:**
    - `src/lib/bookAccessApi.ts` *(tạo mới)*: client `GET/PUT /api/admin/books/:bookId/access`.
    - `src/components/BookChapterLockList.tsx` & `src/components/BookAccessModal.tsx` *(tạo mới, nạp lười `0 B` entry)*: 2 tab (**Phân quyền Tập sách**: `Theo bộ` / `Mở công khai đọc thử` / `Khoá riêng tập` + chọn thành viên Discord, sao chép từ bộ/tập khác; **Khoá từng Chương**: danh sách chương chuẩn hoá, tick từng chương, nút nhanh *"Khoá từ chương này trở đi"*, *"Mở khoá tất cả"*, *"Áp dụng cùng danh sách thành viên"* hoặc chỉnh riêng từng chương).
    - Nối nút ổ khoá `🔒` quản trị trên `BookCard.tsx` (chỉ Admin), `BookInfoModal.tsx` (chỉ Admin), và huy hiệu hiển thị trên `BookCard` cho Admin (`🔒 Tập` / `🔒 N chương` / `🌐 Đọc thử`).
  - **D15 — Chấm nửa sao & Đọc lại (`Re-read`, không có `Tạm ngưng`):**
    - `src/components/HalfStarRatingControl.tsx` *(tạo mới)*, `src/components/CommunityReviewsSection.tsx`, `src/lib/communityApi.ts`: chấm bước `0.5★` (`0.5..5.0`) + hiển thị nửa sao.
    - `src/hooks/useLibraryDataStore.ts` *(tách helper giữ `< 450` dòng)*, `src/components/BookInfoModal.tsx`, `src/components/BookCard.tsx`, `src/components/ReaderChapterEndNav.tsx`, `src/components/ReadingStatsModal.tsx`: nút **"Đọc lại từ đầu"** tăng `rereadCount`, giữ nguyên `readingSeconds`, hiển thị huy hiệu `↻ ×N`.
  - **D16 — Cùng gu trong kho & Liên kết Bộ cùng Vũ trụ:**
    - `src/lib/shelfRecommendations.ts` *(tạo mới)*, `src/components/ShelfRelatedStrip.tsx` *(tạo mới)*, `src/components/ShelfRelationsModal.tsx` *(tạo mới, nạp lười)*, `src/components/ShelfDetailHeroActions.tsx` *(tách từ `ShelfDetailHero.tsx` giữ cả 2 file `<= 350` dòng)*, `src/components/ShelfDetailView.tsx`.
  - **D18 — Xuất Markdown Trích dẫn & Kiểm tra Sức khoẻ Kho sách:**
    - `src/lib/quoteMarkdownExport.ts` *(tạo mới)* & `src/components/QuoteVaultModal.tsx`: xuất `.md` chỉ cho `owner` (có `URL.revokeObjectURL`).
    - `src/lib/libraryHealthAudit.ts` *(tạo mới)* & `src/components/AdminLibraryHealthModal.tsx` *(tạo mới, nạp lười)* gắn vào `AdminModalsHost.tsx`, mở từ nút gọn trên `LibraryHeader.tsx` (chỉ Admin) & `CommandPaletteModal.tsx`.

---

## 4. Checklist kiểm thử bắt buộc (`AGENTS.md` §7)

- [ ] **Tĩnh & Build:** `npm run typecheck`, `npm run lint` (0/0, mọi file `<= 500` dòng hiệu dụng), `cd workers/r2-storage && npx tsc --noEmit`, `npm run build` (`dist/assets/index-*.js <= 86.04 kB` gzip).
- [ ] **Worker + D1 cục bộ (migration `0018`):**
  - Chấm nửa sao `0.5`, `3.5`, `4.5`, `5.0`, xoá điểm & tương thích ngược dòng sao cũ.
  - `PUT /api/progress/:bookId` lưu & giữ nguyên `readingSeconds` khi tăng `rereadCount`.
  - **Khoá 3 tầng (`D19`):**
    - Bộ `public` + Tập 2 `restricted` → Guest đọc được Tập 1, bị `403` trên Tập 2 (TOC/chapter/search/illustrations/media/progress/bookmarks/highlights/community).
    - Bộ `restricted` + Tập 1 `public` → Guest đọc thử được Tập 1, bị `403` trên Tập 2.
    - Tập mở + Chương 3–5 `restricted` (có phân quyền riêng thành viên A) → Guest B thấy `locked: true` trong TOC, bị `403` khi mở Chương 3–5, bị `403` khi dò `/media/:idx` của ảnh chỉ thuộc Chương 3–5, `search` & `illustrations` bỏ qua sạch Chương 3–5; Guest A được cấp quyền vẫn đọc bình thường; Owner luôn đọc được mọi thứ.
    - Xoá sách tự dọn sạch `book_access_rules`, `book_guest_grants`, `chapter_access_rules`, `chapter_guest_grants`.
  - `PUT / DELETE /api/shelves/relations` (Owner OK, Guest `403`), Guest không thấy liên kết đụng bộ bị khoá, đổi tên/xoá kệ tự gộp/dọn.
  - `PUT / GET /api/reader-settings` đồng bộ `fontWeight` & `eyeBreakMinutes`.
- [ ] **Trình duyệt thật (Desktop `1280×800` & Mobile `390×844`, 0 lỗi Console/Page):**
  - Kiểm thử đủ 8 hạng mục: A1 (4 nền + mobile), A2, C12 (DOM + Canvas), C13 (WPM + Nhắc nghỉ mắt), D15 (nửa sao + Đọc lại, xác nhận không còn `Tạm ngưng`), D16, D18 (Markdown Owner-only + Sức khoẻ kho sách), D19 (Modal khoá tập/chương của Admin + ổ khoá trên bìa & Mục lục Guest).
- [ ] **Tài liệu & Bàn giao:** Cập nhật `docs/DECISIONS.md` (`D-042`), `docs/ARCHITECTURE.md` và `HANDOFF.md` (`< 60` dòng, không ghi hash commit) trong cùng commit.
