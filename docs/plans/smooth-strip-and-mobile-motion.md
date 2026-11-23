# Kế hoạch Mượt hoá Animation & Lướt Ngang/Dọc Giống TMW (`docs/plans/smooth-strip-and-mobile-motion.md`)

> **Nhánh triển khai:** `fix/smooth-strip-and-mobile-motion` (tách từ `origin/main` sau PR #17)
> **Bằng chứng thực tế:** Đối chiếu khung hình 3 FPS giữa `tmw_trans.mp4` và `ofu_trans.mp4` trên Chrome iOS.

---

## 1. 4 Nguyên nhân khiến `ofu_trans.mp4` bị nhảy lên xuống & khựng hơn `tmw_trans.mp4`

1. **`card-scroll-reveal` (tụt `18px` + `opacity: 0` + trễ lệch thứ tự) gắn trên từng thẻ trong dải cuộn ngang (`EditorialBookStrip.tsx:41,58,72`, `index.css:375-388`):**
   - Trong `ofu_trans.mp4` (`00:02–00:08`), khi vuốt ngang qua **Thịnh hành tuần này** và **Mới cập nhật gần đây**, các thẻ `04..10` nằm ngoài màn hình ban đầu đều bị ẩn (`opacity: 0`) và hạ thấp `18px` (`translate3d(0, 18px, 0)`).
   - `staggerDelayMs = ((rankNumber - 1) % 7) * 48` làm thẻ `08` (`7 % 7 = 0ms`) bật lên **trước** thẻ `07` (`288ms`), tạo cảm giác khoảng đen trống rồi các thẻ **nhảy lên xuống lệch hàng** như bắp rang. Ở `tmw_trans.mp4`, toàn bộ 10 thẻ nằm phẳng trên 1 ray ngang cố định từ đầu.
2. **Preload ảnh bìa thiếu biên ngang (`useCardReveal.ts:57`):**
   - `sharedPreloadObserver` đang dùng `rootMargin: '320px 0px'` (`0px` theo trục ngang), nên ảnh bìa các thẻ `04..10` trong dải ngang chỉ bắt đầu tải **sau khi đã lọt vào màn hình**, gây trễ hiện bìa khi vuốt nhanh.
3. **Dính `:hover` cảm ứng trên iOS & hiệu ứng nhấc `-5px` trên dải biên tập (`EditorialBookStrip.tsx:79,187`, `index.css:370`, `tailwind.config.js`):**
   - Tailwind v3 mặc định chưa bật `future: { hoverOnlyWhenSupported: true }` và `.group:hover .editorial-rank-num` (`translate3d(0, -2px, 0)`) nằm ngoài `@media (hover: hover)`. Trên iPhone, mỗi lần đặt ngón tay chạm vào thẻ để vuốt ngang là kích hoạt sticky `:hover` làm số nhảy `-2px`, bìa phóng to `1.03x` và dính nguyên trạng thái đó.
   - Trên PC, `EditorialRankedCard` gắn thêm `handleCoverTiltMove` (`--tilt-lift: -5px`) làm thẻ bị nhấc nhảy lên xuống khi lia chuột ngang qua dải Popular, khác phong thái tĩnh êm của TMW.
4. **Hiệu ứng nhảy `18px` + trễ lệch cột (`index % 6`) khi cuộn dọc `03 · Thư viện truyện` (`BookCard.tsx:86`, `ShelfCoverCard.tsx:48`, `index.css:375-388`):**
   - Trên lưới 2 cột điện thoại, `(index % 6) * 48ms` khiến hàng dưới bị trễ `240ms + 560ms = 800ms` và thẻ cột phải nhảy lên trước thẻ cột trái (`ofu_trans.mp4` giây `00:09`). Trong `tmw_trans.mp4` (`00:05–00:08`), lưới sách cuộn dọc hiện tức thì và đằm tay.

---

## 2. So sánh phương án

| Phương án | Mô tả | Công sức | Rủi ro | Hoàn tác |
|---|---|---|---|---|
| **PA-1 (Khuyến nghị)** — Phẳng tuyệt đối dải ngang + chống sticky-hover cảm ứng + dịu nhẹ cuộn dọc | (1) Bỏ hoàn toàn `card-scroll-reveal` và `tilt` nhấc `-5px` khỏi `EditorialBookStrip` (dải **Thịnh hành** & **Mới cập nhật** luôn nằm phẳng 1 hàng ngang cố định, tải trước ảnh cả dải theo 1 observer chung, thêm `overscroll-x-contain`). (2) Bật `future: { hoverOnlyWhenSupported: true }` và bọc `.group:hover` CSS trong `@media (hover: hover) and (pointer: fine)` để chạm tay trên điện thoại không bao giờ dính/nhảy hover. (3) Trên màn cảm ứng (`hover: none`), tắt dịch chuyển Y `18px` ở `.card-scroll-reveal` (chỉ fade cực nhanh `180ms` / `0` delay) và mở rộng `rootMargin` preload ảnh lên `'480px 240px'`; trên PC giảm độ nhảy `card-scroll-reveal` xuống nhẹ (`8px`, `280ms`, stagger `<= 96ms`) và giữ nguyên nghiêng 3D cho `BookCard` / `ShelfCoverCard`. | Thấp (6 file UI/CSS) | Rất thấp; giữ được nét sang trọng của PC lẫn độ mượt tuyệt đối kiểu TMW trên điện thoại. **Điểm yếu:** trên iPad màn rộng (`>= 640px`, cảm ứng `hover: none`), các nút phụ nhỏ (`ⓘ`/`✏️`) dùng `sm:opacity-0` sẽ cần hiện sẵn bằng media query `(hover: none)` (sẽ xử lý gọn ngay bằng class/CSS kèm theo). | Rất dễ (`git revert`) |
| **PA-2** — Tắt toàn bộ `card-scroll-reveal` và 3D tilt trên cả PC lẫn điện thoại | Xoá hoàn toàn hiệu ứng lướt hiện & nghiêng 3D ở mọi nơi, chỉ giữ zoom ảnh `1.03x` khi hover bằng chuột giống TMW 100%. | Thấp (5 file) | Rất thấp; cực kỳ nhẹ và tĩnh tuyệt đối. **Điểm yếu:** mất luôn hiệu ứng nghiêng 3D bằng chuột trên PC ở lưới sách/kệ. | Rất dễ |
| **PA-3** — Chỉ gỡ `card-scroll-reveal` riêng trên `EditorialBookStrip.tsx` | Chỉ sửa 1 file `EditorialBookStrip.tsx`. | Rất thấp (1 file) | Trung bình về UX: chạm tay trên điện thoại vẫn dính `:hover` nhảy số/bìa, và cuộn dọc xuống `03 · Thư viện truyện` thẻ vẫn nhảy `18px` lệch cột. | Rất dễ |

> **Khuyến nghị:** Chọn **PA-1** — dải Popular & Mới cập nhật sẽ phẳng lì và lướt mượt hệt như `tmw_trans.mp4`, chạm tay trên điện thoại không dính/nhảy, cuộn dọc lưới kho truyện mượt tức thì, mà trên PC vẫn giữ cảm giác phản hồi tinh tế.

---

## 3. Lộ trình triển khai (2 Phase)

### Phase 1 — Phẳng hoá & mượt hoá dải ngang (`EditorialBookStrip.tsx`, `useCardReveal.ts`)
- `src/components/EditorialBookStrip.tsx`:
  - Gỡ `card-scroll-reveal`, `--stagger-delay` và `handleCoverTiltMove`/`tilt-card` khỏi `EditorialRankedCard` → 10 thẻ nằm phẳng hoàn toàn trên cùng 1 trục Y, không nhảy lên xuống khi vuốt hoặc lia chuột; giữ mượt `group-hover:scale-[1.03]` (chỉ kích hoạt trên chuột), vạch đỏ nhấn và viền sáng.
  - Gắn 1 `useCardReveal` duy nhất ở cấp `<section>` của `EditorialBookStrip` để nạp trước ảnh bìa cả 10 cuốn ngay khi dải sắp vào khung nhìn (không chờ từng thẻ lọt màn hình).
  - Thêm `overscroll-x-contain` cho thanh cuộn ngang, giữ mượt momentum cuộn iOS; hiển thị gọn cụm nút `←` `→` tròn ở góc phải tiêu đề giống nhịp điều hướng của TMW (chỉ hiện khi tràn ngang).
- `src/hooks/useCardReveal.ts`:
  - Mở rộng `sharedPreloadObserver` từ `rootMargin: '320px 0px'` sang `'480px 260px'` (preload trước cả trục dọc lẫn trục ngang).
  - Giảm `--tilt-lift` của `handleCoverTiltMove` trên PC từ `-5px` xuống `-2px` cho đằm tay hơn.
- **Rủi ro & hoàn tác:** Không đụng logic dữ liệu/API; hoàn tác trong 1 lệnh `git revert`.

### Phase 2 — Chống sticky-hover cảm ứng & tinh chỉnh cuộn dọc (`tailwind.config.js`, `src/index.css`, `BookCard.tsx`, `ShelfCoverCard.tsx`)
- `tailwind.config.js`: Bật `future: { hoverOnlyWhenSupported: true }` để mọi class `hover:` / `group-hover:` chỉ kích hoạt trên thiết bị có chuột thực (`@media (hover: hover)`).
- `src/index.css`:
  - Bọc `.group:hover .group-hover-crimson` và `.group:hover .editorial-rank-num` trong `@media (hover: hover) and (pointer: fine)` (và bỏ dịch chuyển `-2px` gây nhảy số trên thẻ Popular, chỉ đổi sắc đỏ mịn).
  - Tinh gọn `.card-scroll-reveal`: trên thiết bị chuột rút ngắn còn `translate3d(0, 8px, 0)`, `280ms`; trên thiết bị cảm ứng (`@media (hover: none), (pointer: coarse)`) **tắt hoàn toàn dịch chuyển Y & stagger** (`transform: none; transition-delay: 0ms; transition-duration: 180ms`) để cuộn dọc trên điện thoại mượt phẳng như `tmw_trans.mp4`.
  - Bổ sung `.touch-action-visible` trong `@media (hover: none)` để các nút nhanh (`ⓘ`/`✏️`/`★`) vẫn hiển thị rõ trên cả iPad cảm ứng màn rộng (`>= 640px`).
- `src/components/BookCard.tsx` & `src/components/ShelfCoverCard.tsx`:
  - Rút ngắn stagger PC từ `(index % 6) * 48` (tối đa `240ms`) xuống `(index % 4) * 28` (tối đa `84ms`), đồng bộ class hiển thị nút phụ trên cảm ứng.
- **Rủi ro & hoàn tác:** Chỉ cập nhật CSS/class hiển thị; giữ nguyên số dòng hiệu dụng `<= 500`; hoàn tác bằng `git revert`.

---

## 4. Checklist kiểm thử
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi file `<= 500` dòng), `npm run build` (`index-*.js = 85.81 kB <= 86.04 kB` gzip, `0 B` three).
- [x] Kiểm tra CSS build có `@media (hover:hover)` (`7` block) bọc các rule `:hover`, `@media (hover:none)` tắt dịch chuyển Y của `.card-scroll-reveal`, có `overscroll-x-contain`, `touch-action-visible`, và không còn `translate3d(0,-2px,0)`.
- [x] Kiểm thử trực tiếp trên khung hình điện thoại `390×652`:
  - **Thịnh hành tuần này** & **Mới cập nhật gần đây**: 6/6 thẻ đo được có cùng chính xác toạ độ `y` (`0px` chênh lệch trước & sau khi cuộn ngang), nút `←`/`→` tròn `32×32` hoạt động mượt trên mobile, không nhảy lên xuống hay khoảng trống ẩn.
  - Cuộn dọc xuống **03 · Thư viện truyện** mượt phẳng, `0` lỗi console.
- [x] Cập nhật `HANDOFF.md` trong cùng commit.
