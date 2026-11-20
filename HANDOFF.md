# HANDOFF
Cập nhật: 2026-11-21 02:10 | Nhánh: feat/docx-drop-mobi-cbz | Build: 🟢 frontend · 🟢 Worker (live) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai `feat/docx-drop-mobi-cbz` (xoá MOBI/CBZ, thêm DOCX, vá lỗi review — D-009)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/docx-drop-mobi-cbz.md

## Đang làm dở
- **Phase 1 xong & đã deploy live:** Migration `0001_docx_drop_mobi_cbz.sql` đã chạy trên D1 remote `library-db` (giữ nguyên 49 sách EPUB + 4 tiến độ đọc); Worker live bản `b5f00281-9310-469b-a64a-120ab227535b`.
- Đang chuyển sang **Phase 2**: gỡ `@lingo-reader/mobi-parser`, vá `npm audit fix`, viết `src/lib/docxParser.ts` và cập nhật `src/lib/parsers.ts`.

## Bước tiếp theo
1. Phase 2: gỡ `@lingo-reader/mobi-parser`, chạy `npm audit fix`, tạo `src/lib/docxParser.ts` và cập nhật `src/lib/parsers.ts`.
2. Phase 3: cập nhật `types.ts`, `bookMetadata.ts`, `api.ts`, `App.tsx`, `UploadDropzone.tsx`, `Library2DView.tsx`, `ReaderView.tsx` và `docs/ARCHITECTURE.md`.
3. Chạy đầy đủ kiểm thử (typecheck, lint, build, test đọc file `.docx` thật + kiểm tra từ chối `.mobi`/`.cbz`) → push nhánh mở PR vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào. Nhánh `feat/library-3d` (có bản kế hoạch Phase 4 3D) giữ nguyên vẹn để rebase sau khi PR này merge.

## Xong gần nhất
- **Phase 1 (`feat/docx-drop-mobi-cbz`):** chốt `D-009`, sao lưu & migrate D1 remote (`epub`, `pdf`, `docx`), thêm `renameShelfCaseInsensitive`, vá chống ghi đè R2 trùng ID (`409`), thứ tự xoá ảnh bìa cũ sau D1, kiểm tra kiểu `PATCH`, và hỗ trợ HTTP Range suffix `bytes=-N`; deploy Worker live.
