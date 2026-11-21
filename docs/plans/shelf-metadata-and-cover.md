# Kế hoạch Sửa Metadata Tên Sách/Kệ, Chọn Ảnh Bìa Kệ & Ghim Kệ Yêu Thích (`feat/shelf-cover-and-metadata`)

> **Nhánh làm việc:** `feat/shelf-cover-and-metadata` (xếp trên `fix/post-4a-cleanup`).
> **Quyết định đã chốt:** **`D-025` (Phương án PA-A)** — Đồng bộ cả ảnh bìa kệ đại diện và kệ yêu thích qua bảng `shelf_prefs` trên Cloudflare D1 + Worker API kèm cache cục bộ `localStorage` (`0 B` tốn thêm trên R2).

---

## 1. Phạm vi 4 hạng mục đã triển khai

1. **Sửa lỗi dính dấu `-` / `–` cuối tên kệ (`Chitose - Tập 1.epub` → kệ `"Chitose"`):**
   - Hỗ trợ đầy đủ nhóm dấu gạch ngang/hai chấm Unicode (`-`, `–`, `—`, `―`, `−`, `:`, `：`) trong `cleanShelfLabel`, `parseFileMetadata`, `extractSeriesName` và `collectDirectCandidatesForTitle` (`src/lib/shelfPlacement.ts`, `src/lib/bookMetadata.ts`).
2. **Sửa lỗi lấy nhầm `Tập X：Tên tập` làm tên tác giả (`Black Bullet：New World Order - Tập 1：...`):**
   - Bổ sung `VOLUME_WITH_SUBTITLE_RE` & `isVolumeOrSubtitleSegment` giữ trọn `Tập X：Tên tập` trong `title` và đặt `author = "Không rõ tác giả"` khi file không ghi tác giả (nhưng vẫn nhận đúng tác giả nếu có vế thứ 3 và không nhận nhầm tên viết tắt như `V. Hugo`).
   - Nâng cấp `extractMisplacedVolumeFromAuthor` & `getDisplayAuthor` tự khôi phục tiêu đề/ẩn nhãn tập khỏi dòng tác giả cho cả các sách cũ đã lỡ tải lên trước đó.
3. **Chọn ảnh bìa kệ từ 1 tập bất kỳ trong kệ (`ShelfCoverPickerModal.tsx`):**
   - Mở modal chọn nhanh từ ảnh bìa của bất kỳ tập nào trong kệ (hoặc đặt lại mặc định Tập 1) ngay tại `ShelfDetailView` hoặc nút trên `ShelfCoverCard`; vẫn giữ nút `"Đọc từ tập 1"` mở đúng Tập 1 khi kệ chưa đọc.
4. **Ghim Kệ Yêu Thích lên đầu cả `Trang chủ` lẫn `Thư viện` (`shelfPrefs.ts` + `D-025`):**
   - Bảng D1 `shelf_prefs (shelf_key, cover_book_id, is_favorite, updated_at)` (`migrations/0002_shelf_prefs.sql`) + 2 API `PUT /api/shelves/cover` và `PUT /api/shelves/favorite` (tự gộp khi đổi tên kệ và giữ nguyên `is_favorite` nếu tập đang làm bìa bị xoá).
   - `sortShelvesFavoriteFirst` đưa toàn bộ kệ yêu thích lên đầu ở cả **Tab Trang chủ** (`visibleShelves`) và **Tab Thư viện** (`libraryShelves`), kèm nút ngôi sao vàng `Yêu thích` trực tiếp trên cả hai nơi.
   - Chuyển `UploadDropzone` sang `React.lazy` trong `App.tsx` để giảm mạnh dung lượng entry 2D dưới trần `86.04 kB gzip`.

---

## 2. Rủi ro & Cách hoàn tác

| Rủi ro | Giảm thiểu | Hoàn tác |
|---|---|---|
| Worker trên production chưa kịp chạy migration `0002_shelf_prefs.sql` | `listBooksAndProgress` bọc `.catch()` an toàn không crash `GET /api/books`, còn `PUT /api/shelves/*` tự gọi `CREATE TABLE IF NOT EXISTS shelf_prefs` idempotent | `git revert` nhánh PR |
| Xoá cuốn sách đang được ghim làm ảnh bìa kệ | D1 chỉ `SET cover_book_id = NULL` (giữ nguyên `is_favorite = 1`) và frontend tự fallback mượt về Tập 1 | — |

---

## 3. Checklist Kiểm thử (`AGENTS.md` §7)
- [x] Unit test tự động: `Chitose -/–/— Tập 1..2`, `Black Bullet：New World Order - Tập 1..2：...`, `V. Hugo`, sách cũ lệch `author`, chọn bìa kệ Tập 2, ghim kệ yêu thích lên đầu, đổi tên kệ & xoá sách làm bìa PASS 100%.
- [x] `npm run typecheck`, `npm run lint` (0 lỗi, 0 cảnh báo `max-lines`), `npm run build` (`index-*.js <= 86.04 kB gzip`, `0 B three`), Worker `npx tsc --noEmit` XANH.
- [x] Kiểm thử trình duyệt 2D thực tế: upload nhiều tập không dấu tác giả → tên kệ sạch + tác giả `Không rõ tác giả`, bấm ngôi sao Yêu thích → kệ nhảy lên đầu ở cả `Trang chủ` và `Thư viện`, bấm `Đổi ảnh bìa kệ` → đổi sang bìa Tập 2 tức thì.
