# HANDOFF
Cập nhật: 2026-11-25 00:55 | Nhánh: fix/spine-bookshelf-rows | Build: 🟢 XANH (`index-*.js = 84.78 kB` gzip <= `86.04 kB`)
Nhiệm vụ hiện tại: **Tinh chỉnh giao diện v4: Tủ Gáy Sách chia nhiều tầng, bố cục biên tập `Cùng vũ trụ` / `Cùng gu đọc`, độ tương phản nhãn trên bìa sáng & đồng màu icon Header**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Không có — toàn bộ bản tinh chỉnh giao diện đã kiểm thử trực quan trên trình duyệt thật và sẵn sàng merge vào `main`.

## Xong trong nhánh này
1. **Chia hàng nhiều tầng & sửa phối cảnh 3D cho Tủ Gáy Sách (`SpineBookshelfView.tsx`, `SpineBookshelfSlot.tsx`, `src/styles/bookshelf.css`):**
   - Tăng tỷ lệ gáy sách chuẩn Light Novel theo `sqrt(số tập)` (`54..76px` trên Desktop, `38..50px` trên Mobile), giới hạn tối đa `12` bộ/tầng trên Desktop trong khung `max-width: 1120px` (29 bộ chia thành 3 tầng `12 + 12 + 5`).
   - Chuyển `perspective: 1050px` xuống từng `.book-slot` để triệt tiêu hoàn toàn lỗi lộ bìa nghiêng ở nửa bên phải kệ.
2. **Bố cục biên tập & độ tương phản nhãn cho `Cùng vũ trụ` / `Cùng gu đọc` (`ShelfDetailView.tsx`, `ShelfRelatedStrip.tsx`, `BookCard.tsx`):**
   - Dời `ShelfLinkedUniverseStrip` xuống bên dưới `Danh sách tập`, dùng lưới bìa dọc 6 cột (`aspect-[7/10]`) kèm tiêu đề biên tập đánh số (`02`, `03`).
   - Đổi toàn bộ độ mờ Tailwind sang bội số của 5 (`/95`, `/90`, `/85`, `/80`) để không bị mất `background-color` trên bìa sáng màu, và dời dòng lý do `Action · Drama` xuống dưới tên tác giả để mặt bìa sạch thoáng.
3. **Đồng bộ màu icon Header (`LibraryHeader.tsx`):**
   - Đổi icon `HeartPulse` (`Sức khoẻ kho sách`) từ `text-crimson-accent` sang `text-accent` đồng bộ 100% với `Shield`, `Activity` và `Database`.

## Bước tiếp theo
1. Merge Pull Request từ nhánh `fix/spine-bookshelf-rows` vào `main` trên GitHub để tự động deploy frontend lên `https://ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ngoài Git ở thư mục gốc.
