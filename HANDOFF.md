# HANDOFF
Cập nhật: 2026-11-24 12:04 | Nhánh: fix/post-wave4-core-and-mobile | Build: 🟢 typecheck / lint / build (84.58 kB gzip) / Worker tsc xanh
Nhiệm vụ hiện tại: **Hoàn tất PR 1** của kế hoạch `docs/plans/post-wave4-audit-fixes.md` (`D-038`: chốt `1A / 2A / 3A / 4A`, giữ nguyên `weeklyPopular` tính cả bộ `restricted`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã hoàn tất 100% code + kiểm thử PR 1, đã áp migration `0015` lên D1 production (`library-db`) và đã deploy Cloudflare Worker `arcane-library-api`.
- Đang chờ mở & merge Pull Request từ nhánh `fix/post-wave4-core-and-mobile` vào `main` (khi CI xanh, GitHub Actions sẽ tự deploy Frontend lên `ofu.lol`).

## Bước tiếp theo
1. Mở Pull Request `fix/post-wave4-core-and-mobile` → `main` trên GitHub và merge khi CI xanh để cập nhật Frontend lên `ofu.lol`.
2. Khi người dùng sẵn sàng, tạo nhánh riêng `fix/library3d-audit-and-visuals` để triển khai **PR 2** (Phase 5 & 6 — các lỗi 3D Aincrad trong `src/components/library3d/`).

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **PR 1 (`fix/post-wave4-core-and-mobile`, `D-038`) — Đã hoàn tất 100% 4 Phase + Kiểm định thực tế + Sổ sách:**
  - **Phase 1–4:** Vá Backend Worker + migration `0015`, Reader Core & EPUB/DOCX parsers, tương phản chéo 16 cặp theme (`ReaderThemePalette`), 3 lỗi thực tế Mobile iOS (`Tới ↗` Sepia, hộp bôi màu tự lật lên đỉnh, chân trang Lật trang 1 hàng), 2D UI/Modals/Upload Wave 4/PWA/CSS.
  - **Kiểm định tĩnh:** `typecheck` (0 lỗi), `lint` (0 lỗi/0 cảnh báo, mọi file `<= 500` dòng), `build` (`index-*.js = 84.58 kB` gzip `<= 86.04 kB`, 0 Rollup warnings, 0 B 3D ở entry), Worker `tsc --noEmit` (0 lỗi).
  - **Kiểm định Backend local (`wrangler dev` + D1 local):** 9/9 kiểm tra xanh (`D-030` NFD/NFC, `D-028` giữ token/strike khi đổi key & reset sau 24h, `/media/:idx` `0.2` token/ảnh + 60 burst `429` có `Retry-After` với `0` strike, `/illustrations` & `/search` tăng strike, `weeklyPopular` giữ `restricted`, `cleanupOrphanShelves` + `book_highlights`, gộp kệ Đ/đ ở `/usage`, thoát Markdown & ranh giới prefix ở `discordRelease`).
  - **Kiểm định Trình duyệt thật (`1280×800` & `390×844`):** 0 lỗi console/page; xác nhận tương phản Sepia × Đêm khuya (`Tới ↗` & chú thích), hộp bôi màu tự lật lên đỉnh trên `390×844`, chân trang Lật trang 1 hàng trên `390×844`, nhảy `#sec-anchor`, `Escape` modal stacking & Quote Vault nhảy thẳng tới Chương 2.
  - **Tài liệu:** Đã ghi `D-038` vào `docs/DECISIONS.md` và cập nhật đầy đủ `docs/ARCHITECTURE.md`.
