# HANDOFF
Cập nhật: 2026-11-21 02:16 | Nhánh: feat/docx-drop-mobi-cbz | Build: 🟢 frontend · 🟢 Worker (live) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai `feat/docx-drop-mobi-cbz` (xoá MOBI/CBZ, thêm DOCX, vá lỗi review — D-009)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/docx-drop-mobi-cbz.md

## Đang làm dở
- **Phase 1 xong & live:** D1 remote đã migrate (`epub`/`pdf`/`docx`), Worker live `b5f00281-9310-469b-a64a-120ab227535b`.
- **Phase 2 xong:** Gỡ `@lingo-reader/mobi-parser`, vá `npm audit --omit=dev` còn 0 lỗ hổng, tạo `src/lib/docxXml.ts` + `src/lib/docxParser.ts`, cập nhật `parsers.ts`, `types.ts`, `bookMetadata.ts`, `ReaderView.tsx`, `index.css`.
- Đang chuyển sang **Phase 3**: cập nhật `api.ts`, `App.tsx`, `UploadDropzone.tsx`, `Library2DView.tsx` (thông báo DOCX + vá các lỗi client) và kiểm thử thực tế.

## Bước tiếp theo
1. Phase 3: cập nhật `src/lib/api.ts`, `src/App.tsx`, `src/components/UploadDropzone.tsx`, `src/components/Library2DView.tsx`, `docs/ARCHITECTURE.md`.
2. Kiểm thử tự động (typecheck, lint, build) và kiểm thử thực tế tải/đọc file `.docx` + từ chối `.mobi`/`.cbz` trên trình duyệt.
3. Push nhánh `feat/docx-drop-mobi-cbz` để mở PR vào `main` (sau khi merge sẽ rebase `feat/library-3d` lên `main`).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 2 (`feat/docx-drop-mobi-cbz`):** gỡ `@lingo-reader/mobi-parser` & `cbz`, thêm parser DOCX OOXML (`docxXml.ts` + `docxParser.ts`) dùng chung `jszip` + `DOMPurify` với thu hồi `ObjectURL` đầy đủ; `npm audit --omit=dev` đạt 0 lỗ hổng.
- **Phase 1 (`feat/docx-drop-mobi-cbz`):** migrate D1 remote, vá các lỗi Worker và deploy Worker live.
