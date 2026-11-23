# Kế hoạch Triển khai — Thể loại (Tag) Bộ truyện, Tìm kiếm Nâng cao & Lọc theo Tác giả (`feat/shelf-tags-and-author-filter`)

> **Nhánh triển khai:** `feat/shelf-tags-and-author-filter` (tách từ `origin/main` sau PR #18).
> **Quyết định kiến trúc dự kiến (`D-032`):**
> - **PA-A (Cloudflare D1):** Mở rộng bảng `shelf_prefs` với cột `tags_json TEXT` (`PUT /api/shelves/tags`, trả kèm `shelfTags` trong `GET /api/books`, đồng bộ mọi thiết bị & cho khách Discord lọc).
> - **Bộ lọc Thể loại 3 trạng thái chuẩn Light Novel:** 64 thể loại phổ biến + tag tuỳ chỉnh; bấm xoay vòng `Bỏ qua ☐` → `Phải có ☑` → `Loại trừ ☒`; thể loại đã có truyện nổi rõ kèm số bộ `(N)`, thể loại `0` bộ làm mờ nhẹ.
> - **Tìm kiếm nâng cao (bỏ mục Loại truyện):** Panel gập/mở gọn gồm Tác giả (có gợi ý), Trạng thái đọc, Sắp xếp và lưới Thể loại nhiều cột (2 cột mobile không cắt chữ, 3–4 cột tablet/PC).
> - **Bấm tên tác giả:** Chọn tên tác giả trong chi tiết bộ (`ShelfDetailView`) hoặc hộp thông tin sách (`BookInfoModal`) để mở danh sách tất cả các bộ cùng tác giả.
> **Trạng thái:** ✅ Đã hoàn tất triển khai toàn bộ Phase 1 → Phase 3 và kiểm thử PC/mobile.

---

## 1. Mục tiêu & Ràng buộc Kỹ thuật

1. **Tìm kiếm nâng cao & Lọc Thể loại 3 trạng thái:**
   - Giữ thanh tìm kiếm gọn gàng mặc định; bổ sung nút **`Tìm kiếm nâng cao`** ngay trên `LibraryFilterBar` (hiện badge số điều kiện nâng cao đang bật).
   - Khi mở panel (nạp lười qua `React.lazy`, **không** đưa mục *Loại truyện* và *Họa sĩ* vào):
     - **Tác giả:** ô nhập có `<datalist>` gợi ý tự động từ các tác giả thực tế đang có trong kho.
     - **Trạng thái đọc:** `Tất cả` · `Đang đọc` · `Chưa đọc` · `Hoàn thành`.
     - **Sắp xếp** *(ở Tab Thư viện)*: `Tên A → Z` · `Mới tải lên` · `Mới đọc gần đây` · `Nhiều tập nhất`.
     - **Thể loại (64 thể loại chuẩn Light Novel theo ảnh mẫu + tag tuỳ chỉnh Admin đã tạo):**
       - Lưới responsive: **2 cột trên mobile** (chống cắt chữ hoàn toàn), **3 cột trên tablet**, **4 cột trên PC**.
       - Ô lọc nhanh tên thể loại + công tắc chế độ khớp nhóm Phải có: **Tất cả (AND)** *(mặc định)* ↔ **Bất kỳ (OR)** + nút **Xoá chọn thể loại**.
       - **3 trạng thái khi bấm:**
         1. `☐` Chưa chọn (bỏ qua)
         2. `☑` **Phải có** (bộ truyện phải mang thể loại này)
         3. `☒` **Loại trừ** (ẩn các bộ mang thể loại này)
       - Hiện số bộ `(N)` bên cạnh tên thể loại; thể loại `N > 0` nổi rõ, `N = 0` làm mờ nhẹ nhưng vẫn tương tác được.
   - Khi đóng panel mà có bộ lọc đang bật, hiển thị dải **chip lọc đang áp dụng** (`Tác giả: Shiden Kanzaki ×`, `✓ Action ×`, `✕ Harem ×`...) ngay dưới thanh tìm kiếm để tắt lẻ 1 chạm.

2. **Bấm tên tác giả → Ra các bộ cùng tác giả:**
   - Trong `ShelfDetailView` (ngay dưới tiêu đề bộ truyện — đúng vị trí `Shiden Kanzaki` ở ảnh mẫu) và `BookInfoModal`:
     - Với tác giả hợp lệ (khác `Không rõ tác giả`): hiển thị dạng nút tương tác rõ ràng (gạch chân/đổi màu khi hover, tooltip *"Xem các bộ cùng tác giả"*).
     - Nếu 1 kệ có nhiều tác giả (`Author A +1`): tách thành các mục bấm riêng theo từng tác giả hợp lệ trên kệ.
   - Bấm vào tên tác giả → tự động chuyển về danh sách **Tab Thư viện**, đóng trang chi tiết bộ, đặt `authorFilter = <Tên tác giả>` (xoá từ khoá/tag cũ nếu cần hoặc giữ rõ chip `Tác giả: ... ×`), liệt kê toàn bộ các bộ truyện cùng tác giả (khớp chuẩn hoá không dấu/hoa thường, chính xác theo trường `author` chứ không lẫn tên truyện).

3. **Gắn Thể loại cho từng bộ truyện (chỉ Admin `owner`):**
   - Trong `ShelfDetailView`: hiển thị hàng chip thể loại của bộ ngay dưới tên tác giả. **Cả Admin và Khách** đều bấm được vào từng chip thể loại để quay về Tab Thư viện lọc ngay thể loại đó.
   - Admin có nút **`Thể loại`** (hoặc **`+ Gắn thể loại`** khi bộ chưa có tag) mở **`ShelfTagsModal`** (nạp lười trong chunk `LibraryCatalogView`):
     - Lưới 64 thể loại chuẩn dạng checkbox 2 trạng thái + ô tìm nhanh thể loại + ô **Thêm thể loại tự tạo** (tối đa `20` tag/bộ, `40` ký tự/tag).
     - Bấm Lưu đồng bộ lên Cloudflare D1 (`PUT /api/shelves/tags`), cập nhật tức thì UI và lưu cache `localStorage`.

4. **Ràng buộc bất biến của dự án:**
   - **`0 B` phát sinh trên Cloudflare R2** (giữ nguyên trần `9.0 GiB` của `D-002`, chi phí `\$0`).
   - **Bảo toàn ngân sách gói khởi đầu `D-013` (`index-*.js <= 86.04 kB gzip`, `0 B` `three`):** hiện entry đang ở `85.81 kB` gzip (chỉ dư `~0.23 kB`), nên danh sách 64 thể loại, `AdvancedSearchPanel` và `ShelfTagsModal` **bắt buộc nạp lười** (`React.lazy` / chunk `LibraryCatalogView`).
   - **Mỗi file `<= 500` dòng** (`AGENTS.md` §5): tách module riêng cho DB Worker (`shelfTagsDb.ts`), hằng số tag (`shelfTags.ts`), panel nâng cao (`AdvancedSearchPanel.tsx`) và modal gắn tag (`ShelfTagsModal.tsx`), đồng thời tách gọn Hero nếu `ShelfDetailView.tsx` chạm ngưỡng.

---

## 2. Thiết kế Dữ liệu D1 & API Worker (PA-A)

### 2.1. Migration D1 (`workers/r2-storage/migrations/0007_shelf_tags.sql`)
Mở rộng bảng `shelf_prefs` hiện có (`D-025`):

```sql
ALTER TABLE shelf_prefs ADD COLUMN tags_json TEXT;
```

- Tự nâng cấp an toàn trên Worker qua `ensureShelfTagsColumn(env.DB)` (cache bằng `WeakSet<D1Database>`, kiểm tra `PRAGMA table_info(shelf_prefs)` rồi mới `ALTER TABLE`) để tránh lỗi `no such column` kể cả trước khi chạy migration tay.
- Cập nhật `workers/r2-storage/schema.sql` thêm `tags_json TEXT` vào định nghĩa `shelf_prefs`.

### 2.2. API Worker
- **`GET /api/books` (mở rộng tương thích ngược):**
  - Trả thêm `shelfTags: Record<string, string[]>` (cả `owner` và `guest` đều nhận để hiển thị & lọc).
- **`PUT /api/shelves/tags` (`Chỉ Owner`, chặn `403` với `guest`):**
  - Body: `{ shelfName: string, tags: string[] }`.
  - Chuẩn hoá: `trim`, gộp khoảng trắng, chống trùng không phân biệt hoa thường, chuẩn hoá về nhãn chuẩn nếu khớp 1 trong 64 thể loại, giới hạn tối đa `20` tag/bộ và `40` ký tự/tag.
  - Upsert `shelf_prefs.tags_json` (`NULL` nếu mảng rỗng).
  - Cập nhật câu dọn dòng trống trong `shelf_prefs` (ở cả `upsertShelfCover`, `upsertShelfFavorite`, `deleteSingleBook`, `bulkDeleteBooks`) thành:
    `cover_book_id IS NULL AND is_favorite = 0 AND tags_json IS NULL`.
- **Đồng bộ khi Đổi tên / Gộp kệ (`renameShelfCaseInsensitive`):**
  - Tự động gộp (`union`, khử trùng không phân biệt hoa thường, giới hạn `20`) `tags_json` giữa `oldKey` và `newKey` để không bao giờ mất tag khi đổi tên hoặc gộp kệ.

---

## 3. Lộ trình 3 Phase, Rủi ro & Cách hoàn tác

### Phase 1 — Hạ tầng D1, API Worker & State Lọc Dùng chung
- **File tạo mới:**
  - `workers/r2-storage/migrations/0007_shelf_tags.sql`
  - `workers/r2-storage/src/shelfTagsDb.ts` (`~160` dòng): `ensureShelfTagsColumn`, `normalizeShelfTags`, `parseShelfTagsJson`, `mergeShelfTagsJson`, `upsertShelfTags`.
  - `src/lib/shelfTagPresets.ts` (`~110` dòng — **chỉ import trong các component nạp lười**): danh sách đúng 64 thể loại Light Novel từ ảnh mẫu + helper đếm số bộ theo thể loại.
- **File cập nhật:**
  - `workers/r2-storage/schema.sql`
  - `workers/r2-storage/src/booksDb.ts`: trả `shelfTags` trong `listBooksAndProgress`, bảo toàn `tags_json` khi xoá sách/đổi cover/favorite, gọi `mergeShelfTagsJson` khi đổi tên kệ.
  - `workers/r2-storage/src/index.ts` (hoặc chuyển nhánh `/api/shelves/*` gọn để giữ dưới `500` dòng): nối route `PUT /api/shelves/tags` (`requireOwner`).
  - `src/types.ts`: bổ sung `TagMatchMode = 'all' | 'any'`, `ShelfTagFilterState`.
  - `src/lib/shelfPrefs.ts`: mở rộng `ShelfPrefsState` với `tags?: Record<string, string[]>`, `patchShelfTags`, hợp nhất `tags` trong `renameShelfPrefs`, và hàm gọi API `setShelfTags(shelfName, tags)`.
  - `src/lib/api.ts`: map `shelfTags` từ `GET /api/books` vào `shelfPrefs.tags`.
  - `src/hooks/useLibraryDataStore.ts`: thêm `handleShelfTagsChanged`.
  - `src/hooks/useLibraryViewState.ts`: bổ sung state lọc `authorFilter`, `includedTags`, `excludedTags`, `tagMatchMode`, action tiện ích `filterByAuthor(authorName)` & `filterByTag(tagName)`, và áp dụng điều kiện lọc cho cả `libraryShelves` (Tab Thư viện) lẫn `filteredBooks` (Tab Trang chủ).
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Câu `DELETE FROM shelf_prefs WHERE cover_book_id IS NULL AND is_favorite = 0` cũ vô tình xoá mất dòng chỉ có `tags_json`.
  - *Giảm thiểu:* Rà soát tất cả 4 vị trí dọn `shelf_prefs` trong `booksDb.ts` để đều kiểm tra thêm `AND tags_json IS NULL`.
  - *Rủi ro:* `workers/r2-storage/src/booksDb.ts` hoặc `index.ts` vượt 500 dòng ESLint.
  - *Giảm thiểu:* Toàn bộ xử lý tag đặt trong `shelfTagsDb.ts`; kiểm tra số dòng và chạy `npm run lint` + `npx tsc --noEmit` ngay sau Phase 1.
- **Cách hoàn tác:** `git revert` commit Phase 1 (cột `tags_json` nullable trên D1 không ảnh hưởng code cũ).

### Phase 2 — Bấm Tên Tác giả Lọc Cùng Tác giả & Gắn/Hiển thị Thể loại trên Bộ truyện
- **File tạo mới:**
  - `src/components/ShelfTagsModal.tsx` (`~240` dòng, nạp lười trong chunk `LibraryCatalogView`): cửa sổ Admin tick chọn trong 64 thể loại chuẩn + ô tìm nhanh thể loại + thêm tag tuỳ chỉnh + lưu D1.
  - `src/components/ShelfDetailHero.tsx` (`~240` dòng — tách sạch phần Hero ra khỏi `ShelfDetailView.tsx` để giữ cả 2 file dư dả dưới `320` dòng).
- **File cập nhật:**
  - `src/lib/shelfSummary.ts`: bổ sung `authors: string[]` (danh sách tác giả hợp lệ đã khử trùng trên kệ) và `tags: string[]` vào `ShelfSummary`.
  - `src/components/ShelfDetailHero.tsx` & `src/components/ShelfDetailView.tsx`:
    - Biến tên tác giả (`Shiden Kanzaki`...) thành nút bấm tương tác gọi `onSelectAuthor(author)` (chỉ bật khi là tác giả hợp lệ, hỗ trợ nhiều tác giả).
    - Hiển thị hàng chip thể loại ngay dưới tên tác giả (bấm chip gọi `onSelectTag(tag)`).
    - Nút **`Thể loại`** cho Admin mở `ShelfTagsModal`.
  - `src/components/BookInfoModal.tsx`: biến dòng tên tác giả thành nút bấm lọc cùng tác giả (đóng modal và nhảy ra Thư viện lọc theo tác giả đó).
  - `src/components/LibraryCatalogView.tsx`, `src/components/Library2DView.tsx`, `src/components/Library2DDialogsHost.tsx`, `src/App.tsx`: nối prop `shelfTags`, `onShelfTagsChanged`, `onSelectAuthor`, `onSelectTag`.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Tên tác giả trên cùng 1 tác giả nhưng khác hoa thường / thừa dấu cách (ví dụ `Shiden Kanzaki` vs `shiden  kanzaki`).
  - *Giảm thiểu:* Dùng `normalizeSearchText` (đã có trong `useLibraryViewState.ts`) so khớp chính xác sau chuẩn hoá khoảng trắng + chữ thường không dấu.
- **Cách hoàn tác:** `git revert` commit Phase 2.

### Phase 3 — Panel Tìm kiếm Nâng cao (3 Trạng thái Thể loại) & Hoàn thiện Tài liệu
- **File tạo mới:**
  - `src/components/AdvancedSearchPanel.tsx` (`~250` dòng, nạp lười `React.lazy` khi bấm nút *Tìm kiếm nâng cao*):
    - Ô nhập **Tác giả** kèm `<datalist>` gợi ý từ kho truyện.
    - Chọn **Trạng thái đọc** & **Sắp xếp** (khi ở Tab Thư viện).
    - Khu vực **Thể loại**: ô tìm nhanh thể loại, công tắc `Khớp tất cả (AND)` / `Bất kỳ (OR)`, chú thích 3 trạng thái (`☐ Bỏ qua · ☑ Phải có · ☒ Loại trừ`), lưới checkbox 64 thể loại + tag tuỳ chỉnh (2 cột mobile / 3 cột tablet / 4 cột PC), hiện số bộ `(N)` và làm mờ nhẹ mục `0` bộ.
- **File cập nhật:**
  - `src/components/LibraryFilterBar.tsx`:
    - Nút **`Tìm kiếm nâng cao`** (kèm huy hiệu số bộ lọc đang bật) bung/đóng `LazyAdvancedSearchPanel`.
    - Hàng **chip bộ lọc đang hoạt động** (Tác giả, `✓ Tag`, `✕ Tag`) cho phép gỡ lẻ nhanh ngay cả khi đóng panel.
  - `src/components/LibraryCatalogView.tsx` & `src/components/Library2DView.tsx`: truyền danh sách tác giả gợi ý, `shelfTags`, và state/handler lọc nâng cao vào `LibraryFilterBar`.
  - `docs/DECISIONS.md` (chốt `D-032`), `docs/ARCHITECTURE.md` (cập nhật module/API/schema/công cụ), `HANDOFF.md`.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Entry chunk `index-*.js` vượt `86.04 kB` gzip (`D-013`).
  - *Giảm thiểu:* Kiểm tra kích thước build ngay sau Phase 3; `AdvancedSearchPanel` và `shelfTagPresets` chỉ nạp khi mở panel hoặc mở `ShelfTagsModal`.
- **Cách hoàn tác:** `git revert` commit Phase 3.

---

## 4. Checklist Kiểm thử Định nghĩa "Xong" (`AGENTS.md` §7)
- [x] `npm run typecheck`, `npm run lint` (`0` lỗi, mọi file `<= 500` dòng), `npm run build` (`index-*.js = 84.70 kB gzip <= 86.04 kB`, `0 B` `three`) và `npx tsc --noEmit` trong `workers/r2-storage` đều XANH.
- [x] Gắn thể loại cho bộ truyện (gồm cả thể loại có sẵn trong 64 mục lẫn tag tự gõ) → tải lại trang vẫn giữ nguyên (đồng bộ API `PUT /api/shelves/tags`).
- [x] Đổi tên kệ / gộp kệ → tag được giữ nguyên & hợp nhất không mất (`mergeShelfTagsJson` + `renameShelfPrefs`).
- [x] Xoá 1 tập lẻ trong bộ / đổi bìa kệ / bỏ yêu thích kệ → không làm mất tag của bộ (`AND tags_json IS NULL`).
- [x] Mở **Tìm kiếm nâng cao** trên cả PC và khung mobile (`390×844`):
  - Không có mục *Loại truyện*; lưới 2 cột mobile hiển thị trọn vẹn tên thể loại, không cắt chữ, không tràn ngang.
  - Bấm 1 thể loại xoay đúng 3 trạng thái: `☐` → `☑ Phải có` → `☒ Loại trừ` → `☐`; kết hợp nhiều tag + AND/OR lọc chính xác; số bộ `(N)` hiển thị đúng.
- [x] Bấm tên tác giả (ví dụ `Shiden Kanzaki`) trong `ShelfDetailView` và `BookInfoModal` → chuyển ra Thư viện hiển thị đúng tất cả các bộ cùng tác giả đó + chip `Tác giả: Shiden Kanzaki ×`; bấm `×` trả về toàn bộ thư viện.
- [x] Bấm chip thể loại trên `ShelfDetailView` → chuyển ra Thư viện lọc đúng thể loại đó.
- [x] Kiểm tra vai trò `guest`: xem được tag, lọc được theo tag & tác giả, không thấy nút sửa tag, gọi `PUT /api/shelves/tags` bị chặn `403` (`requireOwner`).
- [x] Cập nhật `docs/DECISIONS.md` (`D-032`), `docs/ARCHITECTURE.md` và `HANDOFF.md`.
