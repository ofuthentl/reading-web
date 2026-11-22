# Kế hoạch Triển khai — Phân quyền Đọc theo Bộ cho Thành viên Discord chỉ định (`feat/shelf-member-access`)

> **Nhánh triển khai:** `feat/shelf-member-access` (tách từ `feat/web-2d-enhancements`).
> **Quyết định kiến trúc:** **`D-030`** trong `docs/DECISIONS.md` — **PA-1 (Phân quyền trực tiếp theo Bộ & Thành viên Discord trên Web)** + **Khi bị chặn vẫn hiển thị bìa kèm ổ khoá 🔒**.
> **Trạng thái:** ✅ **Đã hoàn tất triển khai toàn bộ Phase 1 → Phase 3** — sẵn sàng deploy Worker & mở PR.

---

## 1. Mục tiêu & Nguyên tắc Thiết kế

Cho phép Admin (`owner`) chỉ định riêng từng bộ sách (`shelf` / `shelf_key`) chỉ mở quyền đọc cho một số thành viên Discord nhất định (hoặc khoá với toàn bộ khách, chỉ mình Admin đọc), trong khi các thành viên Discord không nằm trong danh sách vẫn nhìn thấy bìa bộ truyện kèm biểu tượng ổ khoá 🔒:

1. **Hai chế độ quyền trên mỗi Bộ (`ShelfAccessMode`):**
   - **`'public'` *(Mặc định)*:** Mọi thành viên Discord có phiên `guest` hợp lệ đều mở đọc được (tương thích ngược 100% với toàn bộ kho sách hiện tại, Admin không phải cấu hình lại từ đầu).
   - **`'restricted'` *(Giới hạn thành viên)*:** Chỉ `owner` và những `discord_user_id` nằm trong danh sách cấp phép của bộ đó mới mở đọc được. *(Nếu danh sách cấp phép để trống `0` người → bộ đó chỉ mình Admin đọc được).*
2. **Trải nghiệm Khách khi bị khoá (`book.guest_locked === true`):**
   - **Vẫn hiển thị bìa sách & tên bộ:** Khách vẫn thấy thẻ sách / thẻ kệ trên Trang chủ (`BookCard`, `EditorialBookStrip`) và Tab Thư viện (`ShelfCoverCard`, `ShelfDetailView`) kèm **huy hiệu ổ khoá `🔒 Giới hạn`**. Ảnh bìa `covers/*` vẫn tải bình thường để giữ thẩm mỹ kệ sách.
   - **Chặn lịch sự khi bấm mở:** Bấm vào bìa sách bị khoá sẽ không gọi API tải chương mà hiện thông báo rõ ràng (*"🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên được chỉ định"*); trong `ShelfDetailView` và `BookInfoModal`, nút *"Đọc sách"* chuyển thành trạng thái khoá `🔒 Cần cấp quyền đọc`; nút *"Đọc tiếp Tập kế →"* cuối sách tự bỏ qua tập bị khoá.
3. **Chốt chặn cứng Fail-closed trên Cloudflare Worker (`403 Forbidden`):**
   - Không chỉ khoá trên giao diện: mọi endpoint đọc nội dung và ghi dữ liệu khách (`/api/guest/books/:id/toc`, `/chapters/:index`, `/media/:mediaIndex`, `/search`, `/api/progress/:id`, `/api/books/:id/bookmarks`) đều kiểm tra quyền thực tế của `auth.userId` trên D1 trước khi trả dữ liệu.
   - **Thu hồi quyền tức thì:** Ngay khoảnh khắc Admin bỏ tick 1 thành viên trên Web, thành viên đó lật sang chương kế tiếp sẽ nhận `403` ngay lập tức mà không cần chờ hết phiên 24 giờ.
4. **Ràng buộc kỹ thuật bất biến:**
   - **`0 B` phát sinh trên Cloudflare R2** (giữ nguyên trần an toàn `9.0 GiB` của `D-002`, chi phí `\$0`).
   - **Giữ nguyên ngân sách gói khởi đầu `D-013`** (`index-*.js <= 86.04 kB gzip`, `0 B` `three` — `ShelfAccessModal` nằm gọn trong chunk nạp lười `LibraryCatalogView`).
   - **Mỗi file `<= 500` dòng code** (`AGENTS.md` §5 — tách module D1 & modal riêng, không nhồi thêm vào các file đang sát trần như `workers/r2-storage/src/index.ts` hay `AdminProtectionModal.tsx`).

---

## 2. Thiết kế Dữ liệu D1 & API Worker

### 2.1. Bảng D1 mới (`workers/r2-storage/migrations/0006_shelf_access.sql`)
Tự động khởi tạo an toàn bằng `ensureShelfAccessTables(db)` (`CREATE TABLE IF NOT EXISTS`) ngay lần gọi đầu:

```sql
CREATE TABLE IF NOT EXISTS shelf_access_rules (
  shelf_key TEXT PRIMARY KEY,
  access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'restricted')),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelf_guest_grants (
  shelf_key TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  granted_label TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (shelf_key, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_grants_user ON shelf_guest_grants(discord_user_id);
```

### 2.2. Mở rộng & Bổ sung API trên Worker
- **`GET /api/books` (mở rộng phản hồi tương thích ngược):**
  - Với `guest`: tính sẵn `guest_locked: boolean` trên từng `Book` dựa trên `shelf_access_rules` và tập quyền của `auth.userId` (1 truy vấn gom nhẹ trong `Promise.all`, **không lộ** danh sách ID người khác được cấp quyền).
  - Với `owner`: trả thêm bản đồ tóm tắt `shelfAccess: Record<shelfKey, { mode: 'restricted'; allowedCount: number }>` để hiển thị huy hiệu quản trị trực tiếp trên kệ mà không cần gọi N request lẻ.
- **`GET /api/admin/shelves/access` (`Chỉ Owner`):**
  - Trả toàn bộ cấu hình phân quyền các kệ đang `restricted` kèm danh sách `discord_user_id` + `granted_label` và danh sách khách `discord_access` để hỗ trợ tính năng *"Sao chép danh sách người đọc từ bộ khác"*.
- **`PUT /api/admin/shelves/access` (`Chỉ Owner`):**
  - Body: `{ shelfName: string, mode: 'public' | 'restricted', allowedUsers: Array<{ discordUserId: string, label?: string | null }> }`.
  - Nếu `mode === 'public'`, xoá dòng cấu hình ở `shelf_access_rules` (hoặc đặt `'public'`) để giữ bảng D1 gọn sạch; nếu `mode === 'restricted'`, cập nhật nguyên tử bằng `env.DB.batch(...)`.
- **Đồng bộ khi Đổi tên / Gộp kệ (`renameShelfCaseInsensitive`):**
  - Khi đổi `oldKey → newKey`, tự động gộp quy tắc `restricted` và chuyển toàn bộ `shelf_guest_grants` sang `newKey` (`INSERT OR IGNORE` + xoá `oldKey`), không làm rơi quyền đã cấp.

---

## 3. Lộ trình 3 Phase, Rủi ro & Cách hoàn tác

### Phase 1 — Hạ tầng D1, Chốt chặn Bảo mật Worker & API Phân quyền
- **File tạo / sửa:**
  - Tạo `workers/r2-storage/migrations/0006_shelf_access.sql` & cập nhật `workers/r2-storage/schema.sql`.
  - Tạo `workers/r2-storage/src/shelfAccessDb.ts` (`~210` dòng): `ensureShelfAccessTables`, `resolveShelfAccessSnapshot`, `assertGuestBookAccess`, `getAdminShelfAccessConfig`, `putAdminShelfAccessConfig`, `mergeShelfAccessOnRename`.
  - Tách nhẹ nhánh route phụ (nếu cần để giữ `workers/r2-storage/src/index.ts` dư dả dưới trần `500` dòng ESLint) và gắn `assertGuestBookAccess(env.DB, auth, bookId)` vào:
    - `workers/r2-storage/src/guestPack.ts` (`getGuestBookToc`, `getGuestEncryptedChapter`, `getGuestEncryptedMediaResponse`)
    - `workers/r2-storage/src/guestSearch.ts` (`searchGuestBookChapters`)
    - `workers/r2-storage/src/progressDb.ts` (`upsertReadingProgress`, `deleteReadingProgress`)
    - `workers/r2-storage/src/bookmarksDb.ts` (`listBookBookmarks`, `createBookBookmark`, `deleteBookBookmark`)
  - Cập nhật `workers/r2-storage/src/booksDb.ts` (`listBooksAndProgress` gắn `guest_locked` + `shelfAccess`, `renameShelfCaseInsensitive` gọi `mergeShelfAccessOnRename`).
  - Cập nhật `src/types.ts` (`Book.guest_locked?: boolean`, `ShelfAccessSummary`, `ShelfAccessRuleDetail`) và tạo `src/lib/shelfAccessApi.ts` (`~95` dòng).
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Quên chạy SQL thủ công trên D1 khi deploy Worker làm lỗi `no such table`.
  - *Giảm thiểu:* Dùng `ensureShelfAccessTables(env.DB)` cache theo instance `WeakSet<D1Database>` giống hệt `auth.ts` (`0003`/`0004`), tự nâng cấp D1 an toàn ngay request đầu tiên.
- **Cách hoàn tác:** `git revert` commit Phase 1; có thể `DROP TABLE IF EXISTS shelf_guest_grants; DROP TABLE IF EXISTS shelf_access_rules;` trên D1 (hoặc giữ nguyên vì không ảnh hưởng bảng cũ).

### Phase 2 — Hiển thị Bìa gắn Ổ khoá 🔒 & Chặn mở lịch sự cho Khách (`2D UI`)
- **File tạo / sửa:**
  - Cập nhật `src/lib/shelfSummary.ts`: tính `isGuestLocked` (khi toàn bộ tập trong kệ có `guest_locked === true`) và đếm số người được phép đọc cho `owner`.
  - Cập nhật `src/components/BookCard.tsx`, `src/components/EditorialBookStrip.tsx` & `src/components/ShelfCoverCard.tsx`:
    - Khi `book.guest_locked` (ở phiên `guest`): vẫn render đầy đủ ảnh bìa sắc nét nhưng đính huy hiệu **`🔒 Giới hạn`** góc trên bìa kèm lớp phủ mờ nhẹ tinh tế khi hover.
    - Với `owner`: hiển thị huy hiệu nhỏ `🔒 N người` (hoặc `🔒 Riêng tư` khi `0` người) trên `ShelfCoverCard` để Admin nhìn lướt biết ngay kệ nào đang giới hạn.
  - Cập nhật `src/components/ShelfDetailView.tsx`, `src/components/BookInfoModal.tsx`, `src/lib/nextVolume.ts` & `src/hooks/useBookReader.ts`:
    - Nếu khách bấm vào sách `book.guest_locked === true`: chặn sớm ngay tại client kèm Toast thông báo *"🔒 Bộ truyện này chỉ được chia sẻ cho một số thành viên chỉ định"* (không mở hộp chờ tải sách vô ích).
    - Trên Hero `ShelfDetailView` và trong `BookInfoModal`: đổi nút hành động chính sang trạng thái khoá `🔒 Cần cấp quyền đọc` khi `guest_locked`.
    - `findNextBookInShelf` tự bỏ qua tập `guest_locked`.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* `BookCard.tsx` hoặc `ShelfDetailView.tsx` tăng dòng gần ngưỡng `500` dòng.
  - *Giảm thiểu:* Kiểm tra số dòng thực tế trước khi sửa; tách badge/helper nhỏ nếu bất kỳ file nào vượt `440` dòng code.
- **Cách hoàn tác:** `git revert` commit Phase 2.

### Phase 3 — Cửa sổ Quản trị Phân quyền Kệ (`ShelfAccessModal`) & Hồ sơ Tài liệu
- **File tạo / sửa:**
  - Tạo `src/components/ShelfAccessModal.tsx` (`~270` dòng, render qua `createPortal(..., document.body)` bên trong chunk nạp lười `LibraryCatalogView` → **`0 B` tăng thêm ở entry bundle**):
    1. Chuyển nhanh giữa **🌐 Mở cho mọi thành viên Discord** và **🔒 Chỉ thành viên được chọn** *(ghi chú rõ: chọn `0` người = Chỉ mình Admin đọc được)*.
    2. Ô tìm kiếm thành viên theo tên / `#4 số cuối` / Discord ID + danh sách tick chọn từ `fetchAdminDiscordGuests()` (có nút *Chọn tất cả* / *Bỏ chọn tất cả*).
    3. Ô **Thêm trước bằng Discord User ID** (`5–32` chữ số + tên gợi nhớ tuỳ chọn) cho thành viên mới chưa từng bấm `/key` lần nào.
    4. Menu nhanh **Sao chép danh sách từ bộ khác** (áp dụng ngay nhóm bạn bè đã chọn ở một kệ `restricted` khác chỉ với 1 cú nhấp).
  - Nối nút **`Phân quyền`** trên thanh công cụ Hero của `src/components/ShelfDetailView.tsx` → `src/components/LibraryCatalogView.tsx` → cập nhật state `shelfAccess` trong `src/hooks/useLibraryDataStore.ts` & `src/App.tsx`.
  - Ghi quyết định **`D-030`** vào `docs/DECISIONS.md`, cập nhật `docs/ARCHITECTURE.md` và `HANDOFF.md` đúng chuẩn `AGENTS.md` §7–§9.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Thành viên được Admin thêm trước bằng Discord User ID thô chưa có dòng trong `discord_access`.
  - *Giảm thiểu:* Bảng `shelf_guest_grants` lưu độc lập theo `discord_user_id` (không ràng buộc khoá ngoại cứng vào `discord_access`), nên ngay khi người bạn đó vào Discord lấy key lần đầu tiên, quyền đọc khớp tự động 100%.
- **Cách hoàn tác:** `git revert` commit Phase 3.

---

## 4. Checklist Kiểm thử Định nghĩa "Xong" (`AGENTS.md` §7)
- [x] `npm run typecheck`, `npm run lint` (`0` lỗi, mọi file `<= 500` dòng), `npm run build` (`index-*.js <= 86.04 kB gzip`, `0 B` `three`) và `npx tsc --noEmit` trong `workers/r2-storage` sạch 100%.
- [x] Kệ mặc định (`public`): mọi thành viên Discord mở đọc bình thường như cũ.
- [x] Kệ bật `restricted` cho Thành viên A (không tick Thành viên B):
  - Thành viên A thấy bìa bình thường (không có ổ khoá) và mở đọc chương/ảnh bình thường.
  - Thành viên B **vẫn thấy bìa sách & bìa kệ gắn nhãn `🔒 Giới hạn`**, bấm vào nhận thông báo khoá lịch sự; thử gọi thẳng `GET /api/guest/books/:id/toc` hoặc `/chapters/0` bằng token của B nhận cứng **`403 Forbidden`**.
- [x] Kệ bật `restricted` với `0` thành viên: khoá với toàn bộ khách Discord, chỉ `owner` đọc được.
- [x] Đổi tên kệ đang `restricted`: danh sách thành viên được cấp quyền tự động giữ nguyên sang tên kệ mới.
- [x] Cập nhật đầy đủ `docs/DECISIONS.md` (`D-030`), `docs/ARCHITECTURE.md` và `HANDOFF.md` trong cùng commit.
