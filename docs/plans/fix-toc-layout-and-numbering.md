# Kế hoạch Sửa Lỗi Hiển thị & Bỏ Đánh số Thứ tự Mục lục (`docs/plans/fix-toc-layout-and-numbering.md`)

> **Nhánh triển khai dự kiến:** `fix/toc-layout-and-numbering`
> **Bằng chứng thực tế:** 2 ảnh chụp do người dùng gửi (Ảnh 1: `GuestCanvasReader` nền tối có thuỷ vân `Du0gzz · #3626` — toàn bộ Mục lục dính thành 1 đoạn văn dài; Ảnh 2: `ReaderView` DOM trên Mobile `ofu.lol` bộ *Unnamed Memory* — tách dòng được nhưng bị đánh số lặp `1. CHƯƠNG 1` → `1. Khúc ca chẳng dỗ giấc nồng`, `2. CHƯƠNG 2` → `1. Đóa hoa đơn sắc`).

---

## 1. Nguyên nhân gốc

1. **Lỗi dính chùm toàn bộ Mục lục thành 1 đoạn văn ở chế độ Khách (`GuestCanvasReader` — Ảnh 1):**
   - Trong `src/lib/guestPackBuilder.ts` (`CONTAINER_BLOCK_TAGS`, dòng 37–49), thiếu thẻ HTML5 `<nav>` (cùng `aside`, `header`, `footer`, `dl`, `dt`, `dd`, `details`, `summary`).
   - Theo chuẩn EPUB3, trang Mục lục trong spine có cấu trúc `<section class="epub-file"><nav epub:type="toc"><h1>MỤC LỤC</h1><ol><li>...<ol><li>...</li></ol></li></ol></nav></section>`. Vì `<nav>` không có trong `CONTAINER_BLOCK_TAGS`, hàm `hasNestedBlockElement(<section>)` trả về `false` → `walkBlockNode` rơi xuống `collectInlineNode`, nuốt trọn cả `<h1>MỤC LỤC</h1>` lẫn toàn bộ danh sách chương thành **1 khối đoạn văn (`p`) phẳng duy nhất**.
   - Ngoài ra, vòng lặp xử lý `<ul>`/`<ol>` (dòng 283–299) cũng làm phẳng `<ol>`/`<ul>` lồng nhau bên trong `<li>` vào cùng 1 dòng với mục cha, và xử lý `<br>` bên trong `<li>` bị gọi nhầm `flushParagraph()` đẩy đoạn văn lên trước khối `list`.
   - Với các EPUB2 đặt các thẻ `<a>` nối tiếp trực tiếp trong `<div>`/`<nav>` (vốn dựa vào CSS `a { display: block }` đã bị `sanitizeBookDocument` tước thẻ `<style>`), cả DOM lẫn `guestPackBuilder` đều có thể làm các dòng dính ngang nhau.

2. **Lỗi đánh số thứ tự thừa & lặp (`1. CHƯƠNG 1` / `1. Khúc ca...` — Ảnh 2):**
   - Chuẩn EPUB3 bắt buộc `<nav epub:type="toc">` dùng thẻ `<ol>` và dựa vào CSS `list-style: none` của sách; khi `sanitizeBookDocument` tước `<style>`, quy tắc `.reading-content ol { list-style-type: decimal; }` trong `src/styles/reader.css` (dòng 96–98) tự ép đánh số `1., 2., 3.` cho cả danh sách chính lẫn từng danh sách con (`1.`) dưới mỗi chương.
   - Tương tự trong `src/lib/guestPackBuilder.ts` (dòng 296) và `src/lib/guestCanvasLayout.ts` (dòng 382), mọi `<ol>` đều bị gắn `ordered: 1` và vẽ tiền tố `1., 2., 3.`.
   - Ngoài ra, mục lục bên trong sách đang chịu chung `text-align: justify` và `text-indent` từ cài đặt đọc văn xuôi thay vì căn trái gọn gàng.
   - Ở ngăn kéo **Mục lục** (`src/components/ReaderTocDrawer.tsx`, dòng 323–325), mỗi dòng cũng đang in cột số thứ tự `01`, `02`, `03`… dẫn tới lệch số so với tên chương (`04 CHƯƠNG 1`, `05 CHƯƠNG 2`).

3. **Tác động tới ~263+ gói `guest-packs` đã lưu sẵn trên Cloudflare R2:**
   - Lỗi `<nav>` xảy ra ở thời điểm đóng gói (`guestPackBuilder.ts`), nên toàn bộ gói cũ trên R2 đang chứa chương Mục lục bị dồn vào 1 đoạn `p` (hoặc `list` có `ordered: 1`). Cần xử lý cả hai chiều: sửa chuẩn ở `guestPackBuilder.ts` cho gói mới/re-pack **và** quyết định có bổ sung lớp tự phục hồi tức thì `0 B` R2 ở client hay bắt buộc re-pack.

---

## 2. Các quyết định cần chốt trước khi code

### QĐ-1: Xử lý ~263+ gói `guest-packs` đã có sẵn trên R2
- **Phương án 1A (Khuyến nghị — Sửa gốc `guestPackBuilder` + tự phục hồi tức thì ở runtime `0 B` R2):**
  - Sửa chuẩn `guestPackBuilder.ts` (hỗ trợ `<nav>`, danh sách lồng nhau giữ cấp thụt lề `depths`, gắn cờ `plain: 1`) cho mọi sách mới tải lên và khi Admin bấm *"Tạo lại toàn bộ gói"*.
  - Đồng thời, ở client `GuestCanvasReader` (`src/lib/tocFormat.ts`), khi mở chương Mục lục của gói cũ: tự động bỏ đánh số mọi khối `list`, và nếu chương bị dính thành 1–2 đoạn `p` dài thì tự tách dòng theo danh sách `tocChapters` thực của sách kết hợp mốc tiêu đề chương (`Mở đầu`, `Chương N`, `Khúc đệm N`, `Phần kết`, `Lời bạt`, `Ngoại truyện`, `Truyện ngắn đặc biệt`…) ngay lúc dàn trang mà **không cần re-pack ngay 263 cuốn**, vẫn bảo toàn nguyên vẹn `blockIndex` highlight, Tìm chữ và thuỷ vân 32-bit.
  - *Điểm yếu:* Với gói cũ chưa re-pack, nếu tiêu đề phụ (vd *"Like a Holy Ground"*) không xuất hiện tách riêng trong `tocChapters`, bản tự phục hồi sẽ giữ gọn trên cùng 1 dòng (`MỞ ĐẦU Like a Holy Ground`) thay vì thụt lề 2 tầng như HTML gốc sau khi re-pack.
- **Phương án 1B (Chỉ sửa `guestPackBuilder`, Admin bấm *"Tạo lại toàn bộ gói"* cho toàn kho):**
  - Không thêm logic tách chuỗi fallback; mọi sách sau khi re-pack chuẩn 100% cấu trúc 2 tầng gốc.
  - *Điểm yếu:* Toàn bộ sách cũ vẫn bị dính chữ ở chế độ `guest` cho tới khi Admin tải và đóng gói lại cả kho ~263 cuốn.
- **Phương án 1C (Ẩn/bỏ qua luôn chương `Mục lục` khỏi danh sách chương):**
  - *Loại:* Làm lệch `chapterIndex` của tiến độ đọc, dấu trang, highlight và khoá chương (`D-042`) đã lưu trên D1; mất trang Mục lục có tiêu đề phụ đẹp của dịch giả.

### QĐ-2: Phạm vi "bỏ hết đánh số thứ tự"
- **Phương án 2A (Khuyến nghị — Bỏ ở CẢ HAI: Trang Mục lục trong sách DOM & Canvas + cột số `01, 02` ở Ngăn kéo Mục lục `ReaderTocDrawer`):**
  - Trang Mục lục trong sách (`ReaderView`, `ReaderPaginatedView`, `GuestCanvasReader`): bỏ hoàn toàn số `1., 2., 3.` và dấu chấm `•`, căn trái, giữ thụt lề phân cấp gọn giữa tên chương chính và tiêu đề phụ (vẫn giữ nguyên đánh số cho `<ol>` bình thường nằm trong thân văn xuôi chương truyện và chú thích).
  - Ngăn kéo Mục lục (`ReaderTocDrawer.tsx`): bỏ cột số `01`, `02`, `03` bị lệch (`04 CHƯƠNG 1` → chỉ còn `CHƯƠNG 1`).
  - *Điểm yếu:* Với các tập sách mà tên chương không đánh số (chỉ có tiêu đề tự do), ngăn kéo sẽ không hiện số đếm thứ tự ở cột trái (vẫn có `Phần X / Y` ở đầu chương và thứ tự danh sách giữ nguyên).
- **Phương án 2B (Chỉ bỏ đánh số ở Trang Mục lục trong sách DOM & Canvas; giữ nguyên `01, 02` ở Ngăn kéo Mục lục):**
  - Giữ nguyên bảng mục lục ngăn kéo bên trái; chỉ làm sạch trang Mục lục bên trong nội dung EPUB/DOCX.
  - *Điểm yếu:* Ngăn kéo vẫn còn số `04 CHƯƠNG 1`, `05 CHƯƠNG 2` trùng/lệch với tên chương.

---

## 3. Lộ trình triển khai dự kiến (3 Phase nhỏ)

### Phase 1 — Tiện ích nhận diện & chuẩn hoá Mục lục dùng chung (`src/lib/tocFormat.ts`, `src/types.ts`, `workers/r2-storage/src/forensicWatermark.ts`)
- Mở rộng kiểu tùy chọn cho `GuestBlock` loại `list`: thêm `plain?: 1` (không vẽ số/bullet) và `depths?: number[]` (cấp thụt lề `0..4` cho danh sách lồng nhau), hoàn toàn tương thích ngược với Worker (`applyForensicWatermarkToBlocks` dùng `{ ...block, items }`, không cần migrate D1/R2).
- Tạo `src/lib/tocFormat.ts`:
  - `isTocChapterTitle(title)`: nhận diện tiêu đề chương Mục lục (`Mục lục`, `Table of Contents`, `Contents`, `TOC`, `Danh mục`…).
  - `prepareGuestTocBlocks(blocks, chapterTitle, tocTitles)`: bỏ tiền tố tiêu đề trùng lặp, tắt đánh số trên khối `list` trong trang Mục lục, và (nếu chốt QĐ-1A) tự tách dòng gọn cho gói cũ bị dính thành 1 đoạn dài (giữ nguyên `blockIndex`).
- **Rủi ro & hoàn tác:** Module thuần hàm không side-effect, `0 B` ảnh hưởng entry (`index-*.js`); hoàn tác bằng `git revert`.

### Phase 2 — Sửa Trình đọc DOM & Ngăn kéo Mục lục (`src/styles/reader.css`, `ReaderDomScrollStage.tsx`, `ReaderPaginatedView.tsx`, `ReaderTocDrawer.tsx`)
- `src/styles/reader.css`:
  - Tắt `list-style` (`none`), đặt `text-align: left`, `text-indent: 0`, khoảng cách & thụt lề phân cấp gọn cho mọi `<ol>`/`<ul>` nằm trong `.reading-content nav` hoặc `.reading-content.reading-content-toc`.
  - Xử lý EPUB2 đặt các thẻ `<a>` liên tiếp trực tiếp trong container mục lục (`:is(nav, section, div) > a[href] { display: block; }`).
  - Không đụng tới `<ol>`/`<ul>` trong thân chương truyện thường.
- `ReaderDomScrollStage.tsx` & `ReaderPaginatedView.tsx`:
  - Gắn class `reading-content-toc` khi `isTocChapterTitle(currentChapter.title)` đúng.
  - Ẩn tiêu đề trùng lặp ngay đầu trang Mục lục (vd `<h1>MỤC LỤC</h1>` trùng `chapter.title`) qua helper/class an toàn mà không phá lệch `domHighlights`.
- `ReaderTocDrawer.tsx`: bỏ cột số thứ tự `01, 02…` nếu chốt QĐ-2A.
- **Rủi ro & hoàn tác:** Chỉ tác động CSS/JSX trong chunk trình đọc; dễ hoàn tác độc lập bằng `git revert`.

### Phase 3 — Sửa gốc `guestPackBuilder.ts` & Dàn trang `GuestCanvasReader` (`guestPackBuilder.ts`, `guestCanvasLayout.ts`, `useGuestCanvasViewport.ts`, `GuestCanvasPaginatedView.tsx`, `GuestCanvasReader.tsx`)
- `src/lib/guestPackBuilder.ts` (giữ `<= 500` dòng theo `AGENTS.md` §5, tách phần helper list/HTML nếu cần):
  - Bổ sung `'nav'`, `'aside'`, `'header'`, `'footer'`, `'dl'`, `'dd'`, `'details'`, `'summary'`, `'center'` vào `CONTAINER_BLOCK_TAGS` và `'dt'`, `'caption'` vào `LEAF_BLOCK_TAGS`.
  - Viết bộ duyệt đệ quy cho `<ul>`/`<ol>` lồng nhau bên trong `<li>` (bảo toàn cấp thụt lề `depths`, xử lý an toàn `<br>`/`<p>` trong `<li>` không đẩy lệch khối ra ngoài danh sách), gắn `plain: 1` khi nằm trong `<nav>` hoặc chương Mục lục.
  - Xử lý container TOC chỉ chứa các thẻ `<a>` nối tiếp không có thẻ block bao ngoài thành từng dòng riêng.
- `src/lib/guestCanvasLayout.ts`, `useGuestCanvasViewport.ts`, `GuestCanvasPaginatedView.tsx`, `GuestCanvasReader.tsx`:
  - Truyền danh sách `tocTitles` vào `computeChapterCanvasLayout`, áp dụng `prepareGuestTocBlocks(...)`, tắt `justify` & `firstLineIndent` trong chương Mục lục.
  - Render khối `list` hỗ trợ `plain: 1` (không vẽ `1., 2., 3.` hay `•`), thụt lề theo `depths[idx]` và thêm khoảng thở nhẹ giữa các nhóm chương chính.
- **Rủi ro & hoàn tác:** Tương thích ngược 100% với gói cũ trên R2 và toàn bộ tính năng Highlight / Tìm chữ / Chú thích / Thuỷ vân; hoàn tác trong 1 commit `git revert`.

---

## 4. Checklist kiểm thử
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi tệp `.ts/.tsx/.css` `<= 500` dòng), `npm run build` (`index-*.js = 84.78 kB <= 86.04 kB` gzip), và `npx tsc --noEmit` trong `workers/r2-storage`.
- [x] Kiểm thử trên trình duyệt thật (Desktop `1280×800` & Mobile `390×844`, cả Cuộn dọc lẫn Lật trang 2 cột, `0` lỗi Console/Page):
  - **Owner (`ReaderView` — DOM):** EPUB3 `<nav epub:type="toc"><ol><li>CHƯƠNG 1<ol><li>Phụ đề</li></ol></li></ol></nav>` hiển thị tách dòng, thụt lề phân cấp rõ (`+21.6px`), **0 đánh số `1., 2., 3.`**, bỏ tiêu đề `MỤC LỤC` lặp, căn trái gọn, `0px` tràn ngang Mobile.
  - **Owner (`ReaderView` — DOM):** Danh sách `<ol>` bình thường trong thân `CHƯƠNG 1` (`Quy tắc thứ nhất...`) **vẫn giữ nguyên đánh số `1., 2., 3.`**.
  - **Guest (`GuestCanvasReader` — gói mới & gói cũ chưa re-pack, `QĐ-1A`):** Kiểm thử logic 7/7 ca + kiểm tra trực tiếp trên dev server thật (*Mushoku Tensei* Vol 1, mẫu Ảnh 1 tách đủ 15 mục, *Unnamed Memory* 2 tầng, chống cắt nhầm tiếng Việt thường & sửa triệt để không thụt lề nhầm `Chương 1` sau `Mở đầu`).
  - **Ngăn kéo Mục lục (`ReaderTocDrawer`, `QĐ-2A`):** Bỏ sạch cột số `01, 02, 03` bên trái tên chương.
- [x] Cập nhật `HANDOFF.md`, `docs/ARCHITECTURE.md` và `docs/DECISIONS.md` (`D-043`) trong cùng commit.
