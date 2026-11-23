# HANDOFF
Cập nhật: 2026-11-23 19:35 | Nhánh: feat/reader-footnotes-gallery-highlights | Build: 🟢 typecheck/lint/Worker tsc/build xanh (`index-*.js = 85.02 kB` gzip <= 86.04 kB)
Nhiệm vụ hiện tại: Hoàn tất **Wave 2** của Lộ trình Nâng cấp v2 (`docs/plans/roadmap-v2-upgrades.md` & `D-036`), sẵn sàng chạy migration `0012`, deploy Worker và mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Không còn việc dở trong **Wave 2** (đã hoàn tất trọn vẹn ước tính thời gian đọc còn lại cả cuốn + Mục 1 Chú thích dịch giả + Mục 2 Tab Minh họa chống spoiler + Mục 5 Highlight bôi màu & Kho trích dẫn).

## Bước tiếp theo
1. Chạy migration `0012_book_highlights.sql` lên D1 production (`--remote`), deploy Cloudflare Worker (`wrangler deploy`), đẩy nhánh `feat/reader-footnotes-gallery-highlights` và mở/merge PR Wave 2 vào `main`.
2. Sau khi Wave 2 merge `main`: tách nhánh `feat/catalog-alt-titles-ptr-anilist-collections` triển khai **Wave 3** (Mục 9 `alt_titles`, Mục 11 Để dành đọc sau, Mục 12 Gợi ý AniList, Mục 13 Bộ sưu tập tuỳ chỉnh, Mục 18 Quản lý Cache IndexedDB, Mục 19 PWA nâng cao).
3. Tiếp nối **Wave 4** (`feat/discord-releases-and-comments`: Mục 14 & 15).

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Wave 2 (`feat/reader-footnotes-gallery-highlights`, `D-036`):**
  - **Giờ đọc còn lại cả cuốn (Mục 4 mở rộng):** hiển thị `Còn ~Xp chương · ~Yg Zp cuốn` ở chân cả 2 trình đọc (`Guest` nội suy từ `compressedBytes` trong `manifest_json` D1, `0` đọc R2).
  - **Phase 2.1 (Mục 1 — Chú thích dịch giả):** `epubFootnotes.ts` + `ReaderFootnotePopover.tsx` hỗ trợ chú thích cùng chương/xuyên chương trên DOM (`Owner`) và gạch chân chấm + bấm `[1]`/`(*)` trực tiếp trên `<canvas>` (`Guest`, chạy ngay với 263 gói cũ).
  - **Phase 2.2 (Mục 2 — Tab Minh họa chống spoiler):** `GET /api/guest/books/:id/illustrations` quét từ gói `OFGP` sẵn có (`0` re-pack), tab thứ 4 `Minh họa` trong ngăn kéo trình đọc kèm công tắc `Che chưa đọc` mặc định BẬT & thumbnail `<canvas>` thuỷ vân Discord cho `Guest` (`0` `<img>` DOM).
  - **Phase 2.3 (Mục 5 — Highlight & Kho trích dẫn):** migration `0012_book_highlights.sql`, CRUD `/api/highlights`, tô 4 màu `<mark>` trên DOM (`Owner`), nút `"Lưu đoạn đang đọc"` vẽ vạch màu trên `<canvas>` (`Guest`, `QĐ-B`), và `QuoteVaultModal` gom trích dẫn theo bộ truyện, kiểm thử E2E PC/Mobile xanh 100%.
- **Wave 1 (PR #21)** đã merge `origin/main` kèm migration `0011` & deploy Worker.
