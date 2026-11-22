# Kế hoạch Triển khai — Chuẩn hoá Tỉ lệ Ảnh Bìa `7:10` & Tự động Đồng bộ Bìa Gốc Toàn Kho (`docs/plans/cover-aspect-ratio.md`)

> **Nhánh triển khai:** `feat/shelf-member-access`
> **Phương án chốt:** Khung bìa chuẩn Light Novel A6 / PDF A4 (`aspect-[7/10]`), giữ nguyên tỉ lệ gốc khi nén ảnh bìa mới (`0%` cắt 4 cạnh) và **tự động đồng bộ ngầm toàn bộ bìa sách cũ về bản gốc chưa cắt (0 thêm nút mới trên giao diện, không đụng gói chống crawl `D-028`)**.

---

## 1. Nguyên nhân gốc cần giải quyết

1. **Lúc tải lên (`src/lib/coverImage.ts`):** `compressCoverBlob` đang ép crop cứng `480×720` (`2:3 ≈ 0.667`), xén mất ~6% bề ngang hai bên trái/phải của bìa Light Novel chuẩn A6 (`105×148 mm ≈ 0.709`).
2. **Lúc hiển thị (`BookCard`, `ShelfCoverCard`, `BookInfoModal`...):** Khung thẻ đặt `aspect-[3/4]` (`0.75`) + `object-cover`, khiến trình duyệt phóng to ảnh `2:3` thêm `12.5%` và xén tiếp `11.1%` chiều cao ở đỉnh & đáy (mất nét đầu chữ `千`, `ラ` sát mép trên).

---

## 2. Lộ trình 2 Phase (0 nút rác trên UI), Rủi ro & Cách hoàn tác

### Phase 1 — Bỏ crop cứng khi nén bìa (`coverImage.ts`), gắn dấu `-v2.jpg` & đồng bộ khung `aspect-[7/10]` toàn UI 2D
- **File sửa:**
  - `src/lib/coverImage.ts`: Bỏ ép cứng `480×720`; giữ nguyên tỉ lệ gốc của ảnh bìa (chỉ kẹp biên an toàn `[0.56, 0.85]` để chắn ảnh banner ngang/dải dọc bất thường), thu về chiều cao chuẩn `720px` (ví dụ bìa Light Novel `1063×1500` → `510×720`, JPEG `0.84`, ~40 KB, `0%` cắt 4 cạnh).
  - `workers/r2-storage/src/index.ts` & `src/lib/api.ts`: Đổi tên khoá ảnh bìa mới thành `covers/${bookId}-${Date.now()}-v2.jpg` để nhận diện chính xác 100% ảnh nào đã chuẩn hoá không cắt xén (không cần thêm cột D1; ảnh thumbnail cũ trên R2 tự động được xoá ngay khi ghi ảnh `-v2.jpg`).
  - Đồng bộ khung hiển thị sang `aspect-[7/10]` (hạ nhẹ hover zoom về `1.03`) tại: `BookCard.tsx`, `ShelfCoverCard.tsx`, `EditorialBookStrip.tsx`, `ShelfDetailView.tsx`, `ShelfCoverPickerModal.tsx`, `BookInfoModal.tsx`, `BookEditModal.tsx`, `Library2DView.tsx`.
- **Rủi ro & Giảm thiểu:** Chế độ 3D (`coverTextureCache.ts`) tự resize qua `createImageBitmap` nên tương thích 100% với ảnh `-v2.jpg`.
- **Cách hoàn tác:** `git revert` commit Phase 1.

### Phase 2 — Tự động đồng bộ ngầm 1 lần toàn bộ bìa sách cũ (`0` nút mới trên giao diện)
- **Cơ chế:**
  - Tạo module nạp lười `src/lib/legacyCoverSync.ts` + gọi ngầm trong `App.tsx` chỉ khi `session.role === 'owner'` và còn sách có `cover_key` chưa mang hậu tố `-v2.jpg` (trừ các ID không có bìa nhúng được ghi nhớ trong `localStorage`).
  - Chạy êm ở nền (`concurrency = 2`), đọc từ cache IndexedDB nếu sẵn có hoặc tải trực tiếp tệp gốc mà **không ghi tràn IndexedDB** (bài học từ `AdminProtectionModal`), trích lại bìa gốc nguyên vẹn qua `extractCoverAtUpload` → gửi `PUT /api/books/:id/cover` → cập nhật từng bìa trực tiếp lên UI ngay khi xong.
  - Khi toàn bộ kho sách đều đã có đuôi `-v2.jpg`, module không bao giờ được nạp hay chạy lại nữa (`0` request thừa về sau, `0` nút mới làm rối giao diện, `0` ảnh hưởng gói chống crawl `guest-packs`).
  - Cập nhật `docs/DECISIONS.md` (`D-031`), `docs/ARCHITECTURE.md` và `HANDOFF.md`.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Sách `.docx` / `.epub` không nhúng sẵn ảnh bìa bên trong nhưng được Admin tự tải ảnh bìa ngoài.
  - *Giảm thiểu:* Nếu `extractCoverAtUpload` trả `null`, tuyệt đối giữ nguyên `cover_key` hiện tại và đánh dấu `skipped` vào `localStorage` để không ghi đè mất ảnh ngoài và không thử lại ở lần mở sau.
- **Cách hoàn tác:** `git revert` commit Phase 2.

---

## 3. Checklist kiểm thử
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi file `<= 500` dòng), `npm run build` (`index-*.js = 85.33 kB <= 86.04 kB` gzip, `0 B` `three` ở entry) & `npx tsc --noEmit` trong `workers/r2-storage`.
- [x] Deploy Worker cập nhật hậu tố `-v2.jpg`.
- [x] Không xuất hiện thêm bất kỳ nút thừa nào trên giao diện kệ/thẻ sách.
- [x] Khi Admin mở trang, các bìa cũ tự động được khôi phục về bản gốc chuẩn tỉ lệ `7:10` ở nền (hiện đủ nét chữ `千`, `ラ` và cả 4 cạnh), chạy xong 1 lần là dừng vĩnh viễn; gói chống crawl (`guest_ready`) giữ nguyên 100%.
