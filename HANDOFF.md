# HANDOFF
Cập nhật: 2026-11-21 02:35 | Nhánh: feat/docx-drop-mobi-cbz | Build: 🟢 frontend · 🟢 Worker (live) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Hoàn tất `feat/docx-drop-mobi-cbz` (D-009: xoá MOBI/CBZ, thêm DOCX, vá lỗi review) — đã push sẵn sàng mở PR vào `main`
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/docx-drop-mobi-cbz.md

## Đang làm dở
- Nhánh `feat/docx-drop-mobi-cbz` đã xong 100% Phase 1 → 3 và kiểm thử tự động + trình duyệt E2E (upload `.docx` có bìa, tách chương, bảng, danh sách, ảnh nhúng; chặn `.mobi`/`.cbz`; 0 lỗi console).
- Cloudflare D1 remote `library-db` đã chạy migration `0001_docx_drop_mobi_cbz.sql` (giữ nguyên 49 sách EPUB + 4 tiến độ đọc); Worker đã deploy live (`b5f00281-9310-469b-a64a-120ab227535b`).

## Bước tiếp theo
1. Mở Pull Request `feat/docx-drop-mobi-cbz` → `main` trên GitHub, xác nhận cả 2 job CI (`Frontend` và `Worker`) đều xanh → Merge vào `main`.
2. Sau khi merge vào `main`: chuyển sang nhánh `feat/library-3d`, rebase lên `origin/main` (và cập nhật bỏ mục ngoại lệ CBZ QĐ-4.3 trong `docs/plans/phase-4-3d.md`) để tiếp tục Phase 4 3D (`FantasyLibrary3D` & `BookSpreadReader`).
3. (Tuỳ chọn sau) Thêm giới hạn số lần thử đăng nhập (rate limit) cho `POST /api/auth/login` trên Cloudflare Worker/WAF.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Kiểm thử E2E & Phase 3 (`feat/docx-drop-mobi-cbz`):** xác nhận thực tế trích bìa & đọc `.docx`, chặn `.mobi`/`.cbz`; đồng bộ đổi tên kệ không phân biệt hoa/thường tiếng Việt, sửa thứ tự xoá cache `deleteBooks()` và kiểm tra `res.ok` ở `saveReadingProgress()`.
- **Phase 2 (`feat/docx-drop-mobi-cbz`):** gỡ `@lingo-reader/mobi-parser` & `cbz`, xây `docxXml.ts` + `docxParser.ts` (dùng chung `jszip` + `DOMPurify`), `npm audit --omit=dev` đạt 0 lỗ hổng.
- **Phase 1 (`feat/docx-drop-mobi-cbz`):** chốt `D-009`, migrate D1 remote (`epub`/`pdf`/`docx`), vá các lỗi Worker và deploy live.
