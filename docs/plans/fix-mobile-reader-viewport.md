# Kế hoạch Sửa Lỗi Cắt Đáy & Không Bấm Được Thanh Chuyển Chương trên Điện Thoại (`docs/plans/fix-mobile-reader-viewport.md`)

> **Nhánh triển khai:** `fix/mobile-reader-viewport` (tách từ `origin/main` sau PR #15)
> **Hiện tượng:** Trên trình duyệt điện thoại (ảnh chụp Chrome iOS trên `ofu.lol`), khi cuộn xuống hết chương, thanh điều hướng cuối chương (`< Trước`, `Sau >`, `Hoàn thành cuốn này!`) và thanh tiến độ `h-1` bị tụt xuống dưới thanh công cụ đáy của trình duyệt; chỉ khi kéo giữ đàn hồi (*rubber-band overscroll*) mới lộ ra, thả tay là bật lại nên không thể bấm.

---

## 1. Nguyên nhân gốc

1. **`h-screen` (`height: 100vh`) trên lớp vỏ trình đọc (`ReaderView.tsx:340`, `GuestCanvasReader.tsx:354`):**
   - Trong `ActiveReaderHost.tsx:62,82`, trình đọc được bọc bởi `fixed inset-0 z-40` (không có `overflow-hidden` hay giới hạn `dvh`), còn bên trong `ReaderView` và `GuestCanvasReader` lại đặt cứng **`h-screen` (`100vh`)**.
   - Trên iOS WebKit (cả Safari lẫn Chrome iOS), **`100vh` luôn tính theo chiều cao lớn nhất (`100lvh`)** — tức đã cộng cả phần diện tích thanh địa chỉ trên và thanh điều hướng đáy của trình duyệt (~`105–120px` cao hơn vùng hiển thị thật).
   - Vì nội dung cuộn nằm bên trong `<main className="overflow-y-auto">` thay vì cuộn `window`, trình duyệt di động **không bao giờ thu gọn thanh công cụ đáy**; kết quả là ~`107px` cuối cùng của trình đọc (trùng đúng chiều cao khối `ReaderChapterEndNav` + thanh tiến độ `h-1`, cũng như toàn bộ `<footer>` của chế độ Lật trang) bị chôn vĩnh viễn phía sau thanh đáy trình duyệt.
2. **Trình đọc PDF vẫn dùng `h-[calc(100vh-3.25rem)]` (`PdfReader.tsx:158,165`, `PdfReaderFallback.tsx:10`, `ReaderView.tsx:403`):**
   - Cùng lỗi `100vh` khiến đáy khung PDF bị đẩy lố xuống dưới màn hình điện thoại.
3. **Thiếu `min-h-0`, `overscroll-y-contain` và khoảng đệm an toàn `env(safe-area-inset-bottom)`:**
   - Các vùng flex con (`<main>` cuộn dọc, khung lật trang `ReaderPaginatedView` / `GuestCanvasPaginatedView`, ngăn kéo `ReaderTocDrawer`) chưa có `min-h-0` đầy đủ và chưa cộng `env(safe-area-inset-bottom)` cho thanh cử chỉ đáy iPhone (đặc biệt khi mở ở chế độ PWA / `viewport-fit=cover`).

---

## 2. So sánh phương án

| Phương án | Mô tả | Công sức | Rủi ro | Khả năng hoàn tác |
|---|---|---|---|---|
| **Phương án 1 (Khuyến nghị)** — Chuẩn hoá viewport động bằng CSS thuần (`fixed inset-0 max-h-dvh` + `h-full min-h-0 flex-1` + `safe-area-inset-bottom`) | Loại bỏ toàn bộ `h-screen` / `100vh` trong hệ trình đọc; để `ActiveReaderHost` giới hạn chiều cao bằng `min(inset-0, 100dvh)` (`fixed inset-0 max-h-dvh overflow-hidden`), mọi trình đọc con giãn `h-full min-h-0 flex-1`, cộng đệm đáy `env(safe-area-inset-bottom)` ở cuộn dọc, lật trang, PDF và ngăn kéo mục lục. | Thấp (~8 file CSS class) | Rất thấp (0 JS listener, không giật khi mở bàn phím tìm kiếm trong `ReaderTocDrawer`). **Điểm yếu:** nếu 1 bản Chrome iOS rất cũ có cờ thử nghiệm làm cả `inset: 0` lẫn `100dvh` báo sai trùng `100lvh`, vẫn cần thêm listener `visualViewport` sau. | Rất dễ (`git revert` 1–2 commit) |
| **Phương án 2** — CSS thuần (PA-1) + JS đồng bộ `window.visualViewport.height` vào biến `--reader-vh` | Giống PA-1, cộng thêm hook `useEffect` cập nhật chiều cao theo `visualViewport.resize` (lọc bỏ lúc đang mở bàn phím / pinch-zoom). | Trung bình | Trung bình (trên iOS khi đóng bàn phím ở tab Tìm chữ/Dấu trang, thứ tự sự kiện `blur` vs `visualViewport.resize` dễ gây nháy 1 nhịp hoặc tính lại phân trang `ReaderPaginatedView`). | Dễ (`git revert`) |
| **Phương án 3** — Chỉ tăng `pb-32` ở `ReaderChapterEndNav` và giữ nguyên `h-screen` | Chêm khoảng trống dưới cuối chương để nút trồi lên trên thanh Chrome. | Rất thấp (1 file) | Cao về UX: thanh tiến độ `h-1`, toàn bộ `<footer>` của chế độ **Lật trang**, và đáy trình đọc **PDF** vẫn bị che; desktop bị dư khoảng trắng xấu. | Rất dễ |

> **Khuyến nghị:** Chọn **Phương án 1**. Sửa triệt để đúng nguyên nhân gốc `100vh = 100lvh` cho cả 3 chế độ (Cuộn dọc, Lật trang, PDF) và cả 2 vai trò (`owner` & `guest`), giữ 0 byte JS thêm và 0 rủi ro giật bàn phím. Nếu thử trên thiết bị thật vẫn thấy phiên bản Chrome iOS nào đó còn lệch, chỉ cần bổ sung lớp fallback JS của Phương án 2 lên riêng `ActiveReaderHost.tsx`.

---

## 3. Lộ trình triển khai (2 Phase)

### Phase 1 — Sửa chiều cao viewport trình đọc & vùng cuộn an toàn (`ActiveReaderHost`, `ReaderView`, `GuestCanvasReader`, `ReaderChapterEndNav`)
- `src/components/ActiveReaderHost.tsx`: Đổi 2 vỏ overlay đọc sách từ `fixed inset-0 z-40` sang `fixed inset-0 z-40 flex max-h-dvh flex-col overflow-hidden` (tự lấy giá trị nhỏ hơn giữa `inset-0` và `100dvh`, fallback tự nhiên về `inset-0` ở trình duyệt cũ).
- `src/components/ReaderView.tsx`:
  - Đổi gốc từ `h-screen` sang `h-full min-h-0 flex-1`.
  - Đổi Suspense fallback PDF từ `h-[calc(100vh-3.25rem)]` sang `min-h-0 flex-1`.
  - Bổ sung `min-h-0 overscroll-y-contain pb-[calc(2.5rem+env(safe-area-inset-bottom))]` cho `<main>` cuộn dọc trên mobile (`sm:pb-12` giữ nguyên trên màn lớn).
- `src/components/GuestCanvasReader.tsx`:
  - Đổi gốc từ `h-screen` sang `h-full min-h-0 flex-1`.
  - Bổ sung `min-h-0 overscroll-y-contain pb-[calc(2.5rem+env(safe-area-inset-bottom))]` cho `<main>` cuộn dọc (`sm:pb-10` giữ nguyên trên màn lớn).
- `src/components/ReaderChapterEndNav.tsx`: Đổi nút `Đọc tiếp` từ `max-w-[19rem]` sang `max-w-full sm:max-w-[19rem]` để tránh tràn ngang trên máy màn hình nhỏ (`320–360px`).
- **Rủi ro & hoàn tác:** Không đổi logic lưu tiến độ hay DOM nội dung; có thể hoàn tác sạch bằng `git revert`.

### Phase 2 — Đồng bộ chế độ Lật trang, PDF và Ngăn kéo Mục lục (`ReaderPaginatedView`, `GuestCanvasPaginatedView`, `PdfReader`, `PdfReaderFallback`, `ReaderTocDrawer`)
- `src/components/ReaderPaginatedView.tsx` & `src/components/GuestCanvasPaginatedView.tsx`:
  - Thêm `min-h-0` vào 2 tầng `flex-1` của sân khấu lật trang để co giãn đúng bên trong `max-h-dvh`.
  - Thêm `pb-[max(0.5rem,env(safe-area-inset-bottom))]` cho `<footer>` (`Trang trước` / `Hoàn thành cuốn này!` / `Trang sau`) để không dính thanh cử chỉ iPhone.
- `src/components/PdfReader.tsx` & `src/components/PdfReaderFallback.tsx`:
  - Thay `h-[calc(100vh-3.25rem)]` bằng `min-h-0 flex-1`, thêm `overscroll-contain` + safe-area bottom cho khung cuộn trang PDF.
- `src/components/ReaderTocDrawer.tsx`:
  - Thêm `max-h-dvh` cho `<aside>` và `min-h-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))]` cho danh sách chương cuộn.
- **Rủi ro & hoàn tác:** Chỉ cập nhật class bố cục flex/safe-area; giữ nguyên số dòng hiệu dụng `<= 500` ở mọi file; hoàn tác bằng `git revert`.

---

## 4. Checklist kiểm thử
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi file `<= 500` dòng), `npm run build` (`index-*.js = 85.81 kB <= 86.04 kB` gzip, `0 B` three).
- [x] Kiểm tra trên khung hình điện thoại (`390×652`) ở chế độ **Cuộn dọc**: cuộn xuống cuối chương thấy rõ trọn vẹn thanh `Trước` / `Sau` / `Hoàn thành cuốn này!` (`bottom ~576px <= 652px`) và thanh tiến độ `h-1` (`648..652px`), bấm `Sau` chuyển mượt sang Chương 2.
- [x] Kiểm tra ở chế độ **Lật trang**: thanh `<footer>` (`top: 564, bottom: 648 <= 652`) hiển thị gọn gàng đúng đáy màn hình, không bị che.
- [x] Kiểm tra **PDF** (đã gỡ toàn bộ `100vh`, dùng `min-h-0 flex-1`) và **Ngăn kéo Mục lục** (`<aside>` `0..652px`, khớp chiều cao viewport).
- [x] Cập nhật `HANDOFF.md` trong cùng commit.
