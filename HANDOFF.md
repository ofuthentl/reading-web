# HANDOFF
Cập nhật: 2026-11-23 11:47 | Nhánh: feat/shelf-tags-and-author-filter | Build: 🟢 frontend (`84.70 kB` gzip, `0 B` three) · 🟢 ESLint 0/0 · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Thể loại (Tag) bộ truyện, Tìm kiếm Nâng cao 3 trạng thái & Bấm tên Tác giả lọc cùng tác giả (`D-032`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã hoàn tất trọn vẹn cả 3 Phase trên nhánh `feat/shelf-tags-and-author-filter` (tách từ `origin/main` sau PR #18):
  1. **Backend D1 & Worker (`migrations/0007_shelf_tags.sql`, `shelfTagsDb.ts`, `booksDb.ts`, `index.ts`):**
     - Mở rộng `shelf_prefs.tags_json TEXT` (tự nâng cấp an toàn qua `ensureShelfTagsSchema`), thêm `PUT /api/shelves/tags` (`Chỉ Owner`), trả `shelfTags` trong `GET /api/books` cho cả Admin & Khách, tự gộp tag khi đổi tên kệ và giữ nguyên tag khi xoá tập lẻ/đổi bìa/bỏ yêu thích.
  2. **Bấm tên Tác giả & Gắn/Hiển thị Thể loại (`ShelfDetailHero.tsx`, `ShelfTagsModal.tsx`, `BookInfoModal.tsx`, `shelfSummary.ts`):**
     - Tên tác giả trong chi tiết bộ & thông tin sách bấm được để chuyển ra Tab Thư viện lọc các bộ cùng tác giả; hiển thị chip thể loại bấm lọc nhanh ngay dưới tác giả; Admin gắn/sửa trong 40 thể loại chuẩn + tag tự tạo.
  3. **Tìm kiếm Nâng cao nạp lười (`AdvancedSearchPanel.tsx`, `LibraryFilterBar.tsx`, `libraryFiltering.ts`, `shelfTagPresets.ts`):**
     - Panel gập/mở bỏ mục *Loại truyện*: ô **Tác giả** gợi ý `<datalist>`, Trạng thái đọc, Sắp xếp, lưới **40 thể loại 3 trạng thái** (`☐ Bỏ qua` → `☑ Phải có` → `☒ Loại trừ`, AND/OR, hiện số bộ `(N)`, 2 cột mobile chống cắt chữ) + dải chip lọc đang bật.
  4. Đã kiểm định `typecheck`, `lint` (`0/0`), `build` (`84.70 kB` gzip), Worker `tsc` và chạy thử 9/9 bước trên trình duyệt PC (`1280×800`) + mobile (`390×844`, `0` lỗi console).

## Bước tiếp theo
1. Deploy Cloudflare Worker (`cd workers/r2-storage && npm run deploy` — cột `tags_json` tự nâng cấp an toàn ở request đầu, có thể chạy thêm `npx wrangler d1 execute library-db --remote --file=./migrations/0007_shelf_tags.sql`).
2. Mở Pull Request `feat/shelf-tags-and-author-filter` vào `main` và bấm Merge khi CI xanh để đưa lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #18 (`fix/smooth-strip-and-mobile-motion`):** Phẳng hoá dải ngang & chống dính hover cảm ứng mobile đã merge vào `main`.
- **PR #17 (`fix/mobile-reader-horizontal-overflow`):** Sửa tràn ngang nút `Đọc tiếp` tên dài trên mobile đã merge vào `main`.
