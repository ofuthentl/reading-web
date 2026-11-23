# Kế hoạch Sửa Lỗi Tràn Ngang & Lệch Nút Đọc Tiếp Trên Điện Thoại (`docs/plans/fix-mobile-reader-horizontal-overflow.md`)

> **Nhánh triển khai:** `fix/mobile-reader-horizontal-overflow` (tách từ `origin/main` sau PR #16)
> **Bằng chứng thực tế:** Video `loi_dien_thoai.mp4` (`00:00–00:12`) quay trên Chrome iOS.
> *(Ghi nhận: bản sửa chiều cao `max-h-dvh` ở PR #16 đã hoạt động tốt — thanh tiến độ đỏ và khu vực nút cuối chương đã nằm hoàn toàn phía trên thanh đáy Chrome.)*

---

## 1. Nguyên nhân gốc (khớp từng khung hình trong `loi_dien_thoai.mp4`)

1. **Bẫy Flexbox `min-width: auto` làm nút `Đọc tiếp: <Tên tập dài>` không cắt ngắn (`truncate`) được (`ReaderChapterEndNav.tsx:44-64`, `ReaderPaginatedView.tsx:354-373`, `GuestCanvasPaginatedView.tsx:329-348`):**
   - Trong `ReaderChapterEndNav.tsx`, cụm nút cuối sách được bọc trong `<div className="flex flex-wrap items-center justify-end gap-2.5">` là **flex item** của `<nav>` nhưng **thiếu `min-w-0 max-w-full`**, còn `<button>` và `<span className="truncate">` bên trong cũng **thiếu `min-w-0`**.
   - Với sách có tiêu đề dài (như *"Đọc tiếp: Phần Thưởng Khi Cứu Quý Bà Ngất Xỉu Là Hẹn Hò Cùng Cặp Con Gái Song Sinh Xinh Đẹp - Tập 2"* ở giây `00:07–00:08`), thẻ `div` bọc tự phình rộng tới ~`700px` theo độ rộng chưa ngắt dòng của `span`, kéo `max-w-full` trên nút thành `100%` của `700px`.
   - Hậu quả kép:
     - Toàn bộ `<main>` bị giãn bề rộng lên ~`700px`, sinh thanh cuộn ngang vô hình khiến người đọc vuốt dọc bị trượt chữ sang trái/phải vào khoảng đen trống (`00:02–00:10`).
     - Nút **`Hoàn thành cuốn này!`** bị `justify-end` đẩy dạt sang tận mép phải ~`700px`, khuất khỏi màn hình điện thoại (`00:07`), phải vuốt sang phải mới thấy (`00:08`).
2. **Khung cuộn `<main>` chưa khoá `overflow-x-hidden` và `.reading-content` chưa bọc chống tràn từ dài (`ReaderView.tsx:474`, `GuestCanvasReader.tsx:482`, `src/index.css:160`):**
   - `<main>` chỉ đặt `overflow-y-auto` (trình duyệt tự bật `overflow-x: auto` khi có phần tử con tràn ngang).
   - Văn bản sách trong `.reading-content` chưa có `overflow-wrap: break-word` (nếu EPUB/DOCX chứa link hoặc chuỗi không dấu cách dài vẫn có thể kéo giãn trang theo chiều ngang).

---

## 2. Lộ trình triển khai (2 Phase gọn)

### Phase 1 — Sửa cắt ngắn nút `Đọc tiếp` & khoá tràn ngang khung cuộn (`ReaderChapterEndNav.tsx`, `ReaderView.tsx`, `GuestCanvasReader.tsx`, `src/index.css`)
- `src/components/ReaderChapterEndNav.tsx`:
  - Đổi wrapper cụm cuối sách sang `contents sm:flex sm:min-w-0 sm:max-w-full sm:flex-wrap sm:items-center sm:justify-end sm:gap-2.5` để:
    - Trên **mobile (`< 640px`)**: Hàng 1 gọn gàng `< Trước` (trái) — `Hoàn thành cuốn này!` (phải); Hàng 2 là nút `Đọc tiếp: ... →` (`w-full min-w-0 max-w-full justify-center`) tự cắt ngắn `...` gọn trong bề rộng màn hình.
    - Trên **desktop (`>= 640px`)**: Giữ nguyên bố cục cụm nút bên phải, có `min-w-0 max-w-full` bảo vệ.
  - Thêm `min-w-0` cho cả `<button>` lẫn `<span className="min-w-0 truncate">`.
- `src/components/ReaderView.tsx`: Thêm `overflow-x-hidden` cho `<main>` và `min-w-0` cho `<article>`.
- `src/components/GuestCanvasReader.tsx`: Thêm `overflow-x-hidden` cho `<main>` và `max-w-full` cho khung bọc canvas.
- `src/index.css`: Thêm `overflow-wrap: break-word;` cho `.reading-content` và `max-width: 100%; overflow-x: auto;` cho `.reading-content pre`.
- **Rủi ro & hoàn tác:** Không đổi cấu trúc dữ liệu hay hành vi đọc; hoàn tác trong 1 lệnh `git revert`.

### Phase 2 — Vá cùng lỗi `min-w-0` ở chế độ Lật trang (`ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`)
- `src/components/ReaderPaginatedView.tsx` & `src/components/GuestCanvasPaginatedView.tsx`:
  - Thêm `min-w-0 max-w-full` vào `<div>` bọc cụm nút `Hoàn thành` + `Đọc tiếp` trong `<footer>`, thêm `min-w-0` vào `<button>` và `<span className="min-w-0 truncate">`.
- **Rủi ro & hoàn tác:** Chỉ sửa class flex nội bộ footer; giữ nguyên số dòng hiệu dụng `<= 500`; hoàn tác bằng `git revert`.

---

## 3. Checklist kiểm thử
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi file `<= 500` dòng), `npm run build` (`index-*.js = 85.80 kB <= 86.04 kB` gzip, `0 B` three).
- [x] Kiểm thử trực tiếp trên khung hình điện thoại `390×652` với bộ 2 tập tên dài giống hệt `loi_dien_thoai.mp4` + URL không dấu cách trong đoạn văn:
  - Chế độ **Cuộn dọc**: `0px` tràn ngang (`main` rộng `390.4px`, `<article>` và `<nav>` rộng `348px` không xê dịch khi cuộn ngang); hàng 1 hiển thị `< Trước` (`16..107px`) + `Hoàn thành cuốn này!` (`167.5..364px`), hàng 2 hiển thị nút `Đọc tiếp: ...` (`16..364px`, `bottom: 575.6px <= 652px`) cắt ngắn `...` gọn gàng.
  - Chế độ **Lật trang**: `<footer>` rộng `390.4px` (`bottom: 648px`), nút `Đọc tiếp: ...` nằm gọn `16..374.4px` không tràn ngang; bấm nút chuyển thẳng sang Tập 2 mượt (`0` lỗi console).
- [x] Cập nhật `HANDOFF.md` trong cùng commit.
