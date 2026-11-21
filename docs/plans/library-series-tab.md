# Kế hoạch triển khai — Tab Thư viện (Hiển thị theo Kệ / Bộ truyện với bìa Tập 1)

> **Mục tiêu:** Thêm tab **Thư viện** vào giao diện 2D của `Ofu's Library`, hiển thị dạng lưới thẻ theo từng **Kệ / Bộ truyện** (2→6 cột responsive), tự động lấy ảnh bìa của **tập 1** trong kệ làm cover hiển thị, hỗ trợ bấm vào thẻ kệ để xem toàn bộ các tập ngay trong tab Thư viện (drill-down) mà không sửa backend/D1 và không xung đột với nhánh 3D (`PR 4A`).

---

## 1. Phạm vi & Các quyết định đã chốt

- **Cặp tab 2D trên Header:** `Trang chủ` | `Thư viện` (chỉ hiển thị ở chế độ 2D; không ảnh hưởng HUD 3D ở `Library3DOverlay`).
- **Tab mặc định:** `Trang chủ`, có lưu tab người dùng chọn lần cuối vào `localStorage` (`ofu-library-active-tab`).
- **Hành vi khi bấm thẻ kệ trong Tab Thư viện:** Mở trang chi tiết kệ (`ShelfDetailView`) ngay bên trong tab `Thư viện` (có nút `← Quay lại Thư viện`, hero card bìa tập 1 + tên kệ + tác giả + số tập + tổng dung lượng + tiến độ đọc + nút `Đọc tiếp / Đọc từ tập 1` + `Đổi tên kệ`, bên dưới là lưới `BookCard` các tập hỗ trợ mở đọc, sửa sách, chọn nhiều).
- **Quy tắc chọn ảnh bìa Tập 1 (`pickShelfCoverBook`):**
  1. Trích số tập theo đúng các quy ước tên file/tiêu đề đã dùng trong `src/lib/shelfPlacement.ts` (`Tập 1`, `Tập 01`, `Vol.1`, `Volume 1`, `v01`, `(01)`, `[1]`, `- 01`, `SAO1`…; không nhầm số trong tên truyện như `86 - Tập 1` hay tập lẻ `1.5`).
  2. Ưu tiên cuốn có **số tập `=== 1` và có `cover_key`** (nếu có nhiều tập 1 trong cùng kệ như bản chính + spin-off, ưu tiên cuốn có tên bộ khớp tên kệ nhất / tên ngắn hơn).
  3. Nếu kệ thiếu tập 1 (hoặc tập 1 không có ảnh bìa) → chọn cuốn có **số tập dương nhỏ nhất có `cover_key`**.
  4. Nếu kệ không đánh số tập (tác phẩm lẻ / kệ tác giả) → chọn cuốn đầu tiên (theo `sortBooksByTitle`) có `cover_key`.
  5. Nếu cả kệ chưa có ảnh bìa → fallback sang cuốn tập 1 (hoặc `books[0]`) để dựng bìa vải cổ điển theo tên kệ.
- **Không thay đổi Backend / D1 / R2:** 100% tính toán phía frontend từ dữ liệu `Book` và `ReadingProgress` hiện có.
- **Ngân sách bundle (`D-008` / `D-013`):** 0 byte `three`, giữ `index-*.js <= 86.04 kB gzip` (tái sử dụng icon `lucide-react` đã có, không cài thêm dependency).

---

## 2. Danh sách file dự kiến tạo / sửa

| File | Thao tác | Trách nhiệm | Ước lượng dòng |
|---|---|---|---|
| `src/types.ts` | Sửa | Thêm `LibraryTab = 'home' \| 'library'` | ~76 |
| `src/lib/bookMetadata.ts` | Sửa | Xuất `pickClothCoverColor(seed)` dùng chung cho `BookCard`, `ShelfCoverCard`, `ShelfDetailView` (tránh lặp code theo `AGENTS.md` §5) | ~82 |
| `src/lib/shelfSummary.ts` | Tạo mới | `extractVolumeNumber`, `pickShelfCoverBook`, `summarizeShelf` (hàm thuần, có test tự động) | ~210 |
| `src/hooks/useLibraryViewState.ts` | Sửa | Thêm `activeTab`, `setActiveTab` (lưu `localStorage`), `openedLibraryShelfKey`, `openLibraryShelf`, `closeLibraryShelf`, `handleShelfRenamed`, `libraryShelves` (lọc giữ đủ tập & bìa tập 1) | ~235 |
| `src/components/BookCard.tsx` | Sửa | Dùng `pickClothCoverColor` từ `src/lib/bookMetadata.ts` | ~300 |
| `src/components/ShelfCoverCard.tsx` | Tạo mới | Thẻ Kệ/Bộ truyện dạng lưới bìa dọc `3/4`: bìa tập 1 (lazy `IntersectionObserver` + `useCoverUrl`), badge `N tập`, nút nhanh `Đổi tên kệ`, thanh tiến độ, tên kệ, tác giả, trạng thái đọc | ~200 |
| `src/components/ShelfDetailView.tsx` | Tạo mới | Màn hình chi tiết 1 kệ trong tab Thư viện: thanh quay lại, hero bìa tập 1 + nút `Đọc tiếp / Đọc từ tập 1` + `Đổi tên kệ`, thanh tìm tập (khi kệ dài), thanh chọn nhiều cục bộ kệ & lưới `BookCard` | ~250 |
| `src/components/LibraryHeader.tsx` | Sửa | Thêm props optional `activeTab?`, `onChangeTab?`, `showSelectionToggle?`; hiển thị cặp tab `Trang chủ` / `Thư viện` trên header 2D (desktop cạnh thương hiệu, mobile thành dải tab gọn) | ~265 |
| `src/components/Library2DView.tsx` | Sửa | Điều phối hiển thị Tab `Trang chủ` (giữ nguyên hiện tại) ↔ Tab `Thư viện` (lưới `ShelfCoverCard` hoặc `ShelfDetailView`) | ~410 |
| `src/App.tsx` | Sửa | Gọi `libraryViewState.syncRenamedShelf(oldName, newName)` trong `handleShelfRenamed` để giữ nguyên màn hình chi tiết kệ khi đổi tên | ~273 |
| `docs/DECISIONS.md` | Sửa | Ghi quyết định `D-018` sau khi chốt | — |
| `docs/ARCHITECTURE.md` | Sửa | Cập nhật bảng module và mục "Công cụ đã có" | — |
| `HANDOFF.md` | Sửa | Cập nhật trạng thái hoàn tất trước khi sang `4A-T3` | < 60 |

---

## 3. Phân chia Phase triển khai

### Phase 1 — Lõi dữ liệu & chọn bìa Tập 1 (`src/lib/shelfSummary.ts`, `src/lib/bookMetadata.ts`, `src/types.ts`)
- **Công việc:**
  1. Thêm `LibraryTab` vào `src/types.ts`.
  2. Chuyển `pickClothCoverColor` sang `src/lib/bookMetadata.ts` và cập nhật `BookCard.tsx` tái sử dụng.
  3. Viết `src/lib/shelfSummary.ts` gồm:
     - `extractVolumeNumber(title)`
     - `pickShelfCoverBook(shelf)`
     - `summarizeShelf(shelf, progress)` (tính `coverBook`, `authorLabel`, `readingStatus`, `completedCount`, `startedCount`, `progressPercent`, `totalBytes`, `resumeBook`, `resumeActionLabel`).
  4. Chạy kịch bản test tự động bằng Node (`npx tsx`) kiểm tra các case khó: `Tập 01`, `Vol.1`, `v01`, `SAO1` vs `SAOP1`, `Ngoại truyện` đứng trước `Tập 1`, `86 - Tập 1`, `Tập 1.5` vs `Tập 1`, `Tập 0` vs `Tập 1`, tập 1 thiếu `cover_key`, kệ toàn tác phẩm lẻ.
- **Rủi ro:** Regex bắt nhầm số trong tên truyện (VD: `"86"`, `"1984"`, `"999"`).
- **Giảm thiểu:** Chỉ chấp nhận số gắn với từ khoá tập/vol, ngoặc cuối, phân cách cuối, hoặc số 1–2 chữ số / có số 0 đầu ở cuối tiêu đề; kiểm chứng trực tiếp bằng bộ unit test nhiều edge cases.
- **Hoàn tác:** Xoá `src/lib/shelfSummary.ts` và hoàn nguyên 3 file sửa.

### Phase 2 — State điều hướng & Header Tab (`src/hooks/useLibraryViewState.ts`, `src/components/LibraryHeader.tsx`, `src/App.tsx`)
- **Công việc:**
  1. Mở rộng `useLibraryViewState` thêm `activeTab` (persist `localStorage`), `openedLibraryShelfKey`, `openLibraryShelf`, `closeLibraryShelf`, `syncRenamedShelf`, và `libraryShelves` (lọc trên `allShelves` để giữ nguyên đủ tập & bìa tập 1 khi tìm kiếm).
  2. Tự động tắt `selectionMode` khi quay ra màn hình lưới kệ (tránh trạng thái chọn cuốn mập mờ), và giữ nguyên `selectionMode` trong `Trang chủ` cũng như `ShelfDetailView`.
  3. Cập nhật `LibraryHeader` nhận props optional `activeTab?`, `onChangeTab?`, `showSelectionToggle?`:
     - Desktop (`md+`): 2 tab `Trang chủ` / `Thư viện` ngay cạnh logo `Ofu's Library`; chuyển thanh dung lượng inline sang `xl:flex` để màn `1024px–1279px` đủ rộng cho cả tab + công tắc `2D/3D`.
     - Mobile (`< md`): dải 2 tab ngang gọn ngay trong sticky header.
     - Không truyền các props này từ `Library3DOverlay` / `Library3DHost` → không ảnh hưởng giao diện 3D.
  4. Nối `libraryViewState.syncRenamedShelf(oldName, newName)` vào `App.tsx`.
- **Rủi ro:** Header bị chật ở breakpoint `768px–1279px` khi bật `canUse3D`.
- **Giảm thiểu:** Đẩy thanh dung lượng nội tuyến lên `xl:flex` (các màn `< 1280px` hiển thị thanh dung lượng gọn ở dải dưới header như hiện đang làm cho `< 1024px`).
- **Hoàn tác:** Revert commit Phase 2.

### Phase 3 — UI Tab Thư viện & Chi tiết Kệ (`ShelfCoverCard.tsx`, `ShelfDetailView.tsx`, `Library2DView.tsx`)
- **Công việc:**
  1. Xây dựng `src/components/ShelfCoverCard.tsx`:
     - Bìa tỉ lệ `3/4`, bo góc `rounded-xl`, `IntersectionObserver` lazy load ảnh bìa tập 1 qua `useCoverUrl` (tự động `URL.revokeObjectURL` khi unmount).
     - Badge số tập góc dưới-phải (`N tập` / `1 cuốn`), nút `Đổi tên kệ` hiện khi hover góc trên-trái, thanh tiến độ mảnh đáy bìa khi có tiến độ.
     - Tiêu đề kệ (`line-clamp-2`), tác giả, trạng thái đọc (`Hoàn thành` / `Đang đọc` / `Chưa đọc`).
     - Đồng bộ hoàn toàn 3 chế độ màu: Ban ngày (`light`), Chiều tối (`dim`), Đêm khuya (`midnight`).
  2. Xây dựng `src/components/ShelfDetailView.tsx`:
     - Nút `← Quay lại Thư viện`, thẻ thông tin kệ (bìa tập 1, tên kệ, tác giả, số tập, dung lượng, tiến độ, nút `Đọc tiếp / Đọc từ tập 1`, nút `Đổi tên kệ`).
     - Ô lọc tập nội bộ khi kệ có `>= 8` cuốn.
     - Thanh chọn nhiều cục bộ trong kệ (`Chọn tất cả trong kệ`, `Chuyển kệ (N)`, `Xoá đã chọn (N)`, `Xong`) + lưới `BookCard` 2→6 cột.
  3. Cập nhật `src/components/Library2DView.tsx` chuyển đổi mượt giữa Tab `Trang chủ` và Tab `Thư viện` (lưới kệ ↔ chi tiết kệ).
- **Rủi ro:** `Library2DView.tsx` vượt 500 dòng hoặc rò rỉ `ObjectURL`.
- **Giảm thiểu:** Tách riêng `ShelfCoverCard` và `ShelfDetailView`; tái sử dụng hoàn toàn `useCoverUrl` (đã có `URL.revokeObjectURL`).
- **Hoàn tác:** Revert commit Phase 3.

### Phase 4 — Kiểm định, đo bundle & cập nhật tài liệu
- **Công việc:**
  1. Chạy `npm run typecheck`, `npm run lint`, `npm run build` — xác nhận 0 lỗi, 0 warning, `index-*.js <= 86.04 kB gzip`, 0 byte `three` trong entry.
  2. Chạy kiểm thử đơn vị cho `src/lib/shelfSummary.ts`.
  3. Kiểm thử thực tế trên trình duyệt (hoặc bản dev) theo checklist §4.
  4. Cập nhật `docs/DECISIONS.md` (`D-018`), `docs/ARCHITECTURE.md`, `HANDOFF.md` trong cùng commit.

---

## 4. Checklist kiểm thử

- [x] **Đầu vào & lưu tab:** Mở ứng dụng lần đầu ở tab `Trang chủ`; bấm `Thư viện` → reload trang vẫn giữ tab `Thư viện`.
- [x] **Chọn bìa Tập 1 chính xác:**
  - [x] Kệ có `Ngoại truyện` + `Tập 01` + `Tập 02`: hiển thị đúng bìa `Tập 01`.
  - [x] Kệ có `SAO1`, `SAO2`, `SAOP1`: hiển thị đúng bìa `SAO1` (kiểm chứng bằng unit test `shelfSummary`).
  - [x] Kệ không có tập 1 (chỉ có tập 2, 3): hiển thị bìa tập 2 (unit test `shelfSummary`).
  - [x] Kệ 1 cuốn duy nhất hoặc kệ toàn sách lẻ: hiển thị bìa cuốn đầu có ảnh, fallback bìa vải cổ điển nếu không có ảnh (`Bạch Dạ Hành`).
- [x] **Tìm kiếm trong Tab Thư viện:** Gõ tên 1 tập bất kỳ (VD `Tập 02`) vẫn hiển thị thẻ kệ chứa nó với **đủ tổng số tập (`3 tập`)** và **đúng bìa tập 1**.
- [x] **Drill-down Chi tiết kệ:**
  - [x] Bấm vào thẻ kệ → mở `ShelfDetailView`, hiển thị đủ các tập, nút `Đọc tiếp / Đọc tập tiếp / Đọc từ tập 1` mở đúng cuốn.
  - [x] Đổi tên kệ ngay trong `ShelfDetailView` (`Sword Art Online` → `SAO Main`) → tiêu đề cập nhật ngay tại chỗ, không bị văng ra ngoài.
  - [x] Bật `Chọn` trong `ShelfDetailView` → `Chọn tất cả` chỉ chọn sách trong kệ này (`3 / 3 tập trong kệ này`); `Chuyển kệ` / `Xoá đã chọn` nối đúng modal; nếu kệ rỗng sau khi chuyển/xoá hết → tự quay về lưới `Thư viện`.
  - [x] Bấm nút `← Quay lại Thư viện` hoặc bấm lại tab `Thư viện` trên Header → quay về lưới thẻ kệ.
- [x] **Responsive & 3 chế độ màu:** Đã kiểm tra desktop `1440px`, laptop `1024px`, mobile `390px` ở cả 3 chế độ Sáng / Chiều tối / Đêm khuya (đã tinh chỉnh thêm `LibraryHeader` chống cắt chữ thương hiệu).
- [x] **Không ảnh hưởng 3D:** HUD 3D không hiển thị tab 2D `Trang chủ` / `Thư viện`, không lỗi console.
- [x] **Build & ngân sách:** `LibraryCatalogView` tách lazy chunk `6.03 kB gzip`; entry `index-*.js` = `84.66 kB gzip` (`<= 86.04 kB`, 0 byte `three`).
