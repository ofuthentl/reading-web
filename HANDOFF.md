# HANDOFF
Cập nhật: 2026-11-25 00:42 | Nhánh: fix/spine-bookshelf-rows | Build: 🟢 XANH (`index-*.js = 84.78 kB` gzip <= `86.04 kB`)
Nhiệm vụ hiện tại: **Tinh chỉnh giao diện v4: Tủ Gáy Sách chia nhiều tầng & mục Cùng vũ trụ / Cùng tác giả bố cục biên tập phía dưới `Danh sách tập`**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Không có — cả 2 bản tinh chỉnh giao diện đã kiểm thử trực quan trên trình duyệt thật và sẵn sàng merge qua PR vào `main`.

## Xong trong nhánh này
1. **Chia hàng nhiều tầng & sửa phối cảnh 3D cho Tủ Gáy Sách (`SpineBookshelfView.tsx`, `SpineBookshelfSlot.tsx`, `src/styles/bookshelf.css`):**
   - Tăng tỷ lệ gáy sách chuẩn Light Novel theo `sqrt(số tập)` (`54..76px` trên Desktop, `38..50px` trên Mobile), giới hạn tối đa `12` bộ/tầng trên Desktop trong khung `max-width: 1120px` (29 bộ chia thành 3 tầng `12 + 12 + 5`).
   - Chuyển `perspective: 1050px` xuống từng `.book-slot` để triệt tiêu hoàn toàn lỗi lộ bìa nghiêng ở nửa bên phải kệ.
2. **Bố cục biên tập phía dưới cho `Cùng vũ trụ` & `Cùng tác giả / gu đọc` (`ShelfDetailView.tsx`, `ShelfRelatedStrip.tsx`):**
   - Dời `ShelfLinkedUniverseStrip` từ phía trên xuống **bên dưới `Danh sách tập`** để ưu tiên hiển thị các tập của bộ đang mở trước.
   - Đổi từ thẻ ngang nhỏ sang **lưới bìa dọc 6 cột (`aspect-[7/10]`)** khớp cột 1:1 với `Danh sách tập`, kèm tiêu đề biên tập đánh số thứ tự (`02 · CÙNG VŨ TRỤ & LIÊN KẾT` / `Cùng vũ trụ`, `03 · TÁC PHẨM CÙNG TÁC GIẢ` / `Cùng tác giả` hoặc `Cùng gu đọc`).

## Bước tiếp theo
1. Mở Pull Request từ nhánh `fix/spine-bookshelf-rows` vào `main` trên GitHub; khi CI xanh và merge vào `main`, GitHub Actions tự động build & deploy frontend lên `https://ofu.lol` (không cần chạy lại migration D1 hay deploy lại Worker).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ngoài Git ở thư mục gốc.
