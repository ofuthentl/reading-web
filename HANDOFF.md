# HANDOFF
Cập nhật: 2026-11-25 00:24 | Nhánh: fix/spine-bookshelf-rows | Build: 🟢 XANH (`index-*.js = 84.79 kB` gzip <= `86.04 kB`)
Nhiệm vụ hiện tại: **Sửa chia hàng nhiều tầng & triệt tiêu lỗi lộ bìa phối cảnh 3D cho Tủ Gáy Sách (`SpineBookshelfView`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Không có — bản sửa giao diện Tủ Gáy Sách đã hoàn tất, đã kiểm thử trực quan với 29 bộ sách trên Desktop (`1280×800`, chia 3 tầng `12 + 12 + 5`) và Mobile (`390×844`), sẵn sàng mở PR sang `main`.

## Xong trong nhánh này
1. **Chia hàng nhiều tầng cân đối (`SpineBookshelfView.tsx` & `SpineBookshelfSlot.tsx`):**
   - Tăng tỷ lệ gáy sách chuẩn Light Novel theo `sqrt(số tập)` (`54..76px` trên Desktop, `38..50px` trên Mobile; chiều cao `204..220px` / `162..174px`), giới hạn tối đa `12` bộ/tầng trên Desktop (`9` / `6` / `4` ở khung hẹp hơn) và gắn `ResizeObserver` qua `useLayoutEffect([hasSummaries])` để không bỏ lỡ lần đo đầu khi dữ liệu tải bất đồng bộ.
   - Đưa khung `.spine-shelf-stage` về `max-width: 1120px` căn giữa để các kệ đầy đặn (~85–95% chiều ngang đợt gỗ), không còn hiện tượng dồn cả 29 bộ vào 1 hàng duy nhất.
2. **Triệt tiêu lỗi lộ bìa nghiêng ở nửa phải kệ (`src/styles/bookshelf.css`):**
   - Chuyển `perspective: 1050px` từ `.spine-shelf-row` về từng `.book-slot` riêng lẻ để pháp tuyến mặt `.face-front` (`rotateY(-90deg)`) của mọi sách đang đóng luôn bị `backface-visibility: hidden` ẩn sạch 100% ở mọi vị trí trái/phải trên kệ.

## Bước tiếp theo
1. Mở Pull Request từ nhánh `fix/spine-bookshelf-rows` vào `main` trên GitHub; khi CI xanh và merge vào `main`, GitHub Actions tự động build & deploy frontend lên `https://ofu.lol` (không cần chạy lại migration D1 hay deploy lại Worker).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ngoài Git ở thư mục gốc.
