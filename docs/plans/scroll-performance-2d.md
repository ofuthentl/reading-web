# Kế hoạch Tối ưu Độ mượt Cuộn Trang 2D 120–144 FPS (`docs/plans/scroll-performance-2d.md`)

> **Nhánh triển khai:** `fix/mobile-admin-header`
> **Bằng chứng thực tế:** Video `Ofu's Library - Brave 2026-11-22 23-53-23.mp4` (`252` cuốn sách / `58` kệ, xuất hiện khựng khung hình rõ ở giây `00:04–00:07` và `00:11–00:13` khi cuộn nhanh).

---

## 1. 4 Nguyên nhân gốc gây khựng khung hình trong Brave / Chromium

1. **`background-attachment: fixed` trên `.theme-canvas` (`src/index.css` dòng 74–90):**
   - Trong Chromium/Brave, đặt `background-attachment: fixed` lên khối cuộn dài 15.000px sẽ **vô hiệu hoá GPU Fast-Scroll Compositing**, ép CPU/GPU vẽ lại toàn màn hình ở mọi khung hình cuộn.
2. **`mikuCursorAnimator.ts` sửa 14 rule CSS toàn trang mỗi `84ms` (`12 lần/giây`):**
   - Sửa `CSSStyleRule.style.cursor` trên 14 selector phức tạp (có cả `:has(> input:disabled)`) làm Blink đánh dấu `NeedsStyleRecalc` trên toàn bộ ~4.500 DOM node của 252 cuốn sách mỗi `84ms` ngay giữa lúc đang cuộn.
3. **272 thẻ `.tilt-card` bật cứng `will-change: transform` + gọi `getBoundingClientRect()` giữa lúc cuộn + 500 lớp `backdrop-blur-sm` (`src/index.css`, `src/hooks/useCardReveal.ts`, `src/components/BookCard.tsx`):**
   - Mọi thẻ sách đều giữ sẵn GPU layer `will-change: transform` + `preserve-3d` ngay cả khi không chạm chuột; khi lăn chuột cuộn qua lưới bìa, các thẻ trượt dưới mũi chuột kích hoạt `onPointerMove` → `getBoundingClientRect()` (gây *Layout Thrashing* đồng bộ — thấy rõ ở giây `00:06` và `00:12` trong video) cộng với hàng trăm nhãn nhỏ `MỚI` / `MB` chạy `backdrop-blur-sm`.
4. **58 kệ sách (`252` cuốn) dưới mục `03 · Thư viện truyện` render & tính layout đồng thời (`Library2DView.tsx`):**
   - Chưa bật `content-visibility: auto` cho các kệ nằm ngoài tầm nhìn, cộng thêm `legacyCoverSync.ts` cập nhật state lẻ từng cuốn (`252` lần re-render liên tiếp thay vì gom lô).

---

## 2. Lộ trình 2 Phase Gọn Nhẹ (Giữ nguyên 100% Giao diện & Hiệu ứng)

### Phase 1 — Mở khoá GPU Composited Scroll & Tắt Layout Thrashing khi cuộn (`index.css`, `useCardReveal.ts`, `BookCard.tsx`, `Library2DView.tsx`)
- **Thay đổi:**
  - `src/index.css`: Thay `background-attachment: fixed` trên `.theme-canvas` bằng lớp nền tĩnh độc lập (`background-attachment` gỡ bỏ, dùng `position: fixed; inset: 0; pointer-events: none; z-index: 0` trên `body::before`) — màu sắc sương đêm giữ nguyên 100% nhưng cuộn bằng GPU thuần `0 ms` repaint.
  - `src/index.css` & `src/hooks/useCardReveal.ts`: Bỏ `will-change: transform` tĩnh trên `.tilt-card` (chỉ bật khi đang hover); khoá tạm `handleCoverTiltMove` trong lúc người dùng đang lăn cuộn trang (`scroll` listener passive + cache `DOMRect` lúc `pointerenter` thay vì gọi `getBoundingClientRect()` mỗi pixel di chuyển!).
  - `src/components/BookCard.tsx`: Bỏ `backdrop-blur-sm` thừa trên 2 nhãn nhỏ nền đặc `MỚI` và dung lượng `MB` (cắt ~500 phép blur GPU).
  - `src/components/Library2DView.tsx` & `src/index.css`: Thêm `.shelf-cv-auto` (`content-visibility: auto; contain-intrinsic-size: auto 340px;`) cho các `<section>` kệ sách dưới Trang chủ để trình duyệt bỏ qua layout/paint của ~50 kệ ngoài màn hình.
- **Rủi ro & Hoàn tác:** Giữ nguyên 100% giao diện và hiệu ứng nghiêng 3D khi rê chuột; nếu lệch khoảng cuộn có thể bỏ `.shelf-cv-auto` trong 1 dòng.

### Phase 2 — Tối ưu Trình phát Con trỏ Động Miku `0` Style-Recalc Toàn trang & Gom lô Đồng bộ Bìa (`mikuCursorAnimator.ts`, `legacyCoverSync.ts`)
- **Thay đổi:**
  - `src/lib/mikuCursorAnimator.ts`:
    1. Tạm dừng bộ đếm `84ms` ngay khi trang đang cuộn (`scroll` passive) và tự chạy lại sau `140ms` khi dừng cuộn (`0.00 ms` JS trong lúc cuộn).
    2. Bỏ selector nặng `:has(> input:disabled)`; theo dõi con trỏ đang hover thuộc đúng **1 nhóm nào** (`mouseover` nhẹ) và **chỉ cập nhật đúng 1 CSS variable duy nhất** đang hiển thị thay vì sửa cả 14 rule mỗi nhịp.
  - `src/lib/legacyCoverSync.ts`: Gom cập nhật UI theo lô (`mỗi 8 cuốn` hoặc khi xong) thay vì gọi `setBooks` 252 lần lẻ tẻ.
- **Rủi ro & Hoàn tác:** Con trỏ Miku vẫn chuyển động 12 khung mượt mà y hệt hiện tại; `git revert` 1 commit nếu cần.

---

## 3. Checklist kiểm thử
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi file `<= 500` dòng), `npm run build` (`index-*.js <= 86.04 kB` gzip).
- [x] Cuộn nhanh qua 252 cuốn sách trên Brave/Chrome chế độ Tối (`dim` / `midnight`) mượt 120–144 FPS, không còn bìa tự nghiêng giật giữa lúc lăn chuột, con trỏ Miku vẫn động mượt khi dừng chuột.
