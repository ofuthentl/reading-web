# HANDOFF
Cập nhật: 2026-11-21 00:34 | Nhánh: refactor/code-splitting | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Refactor code-splitting — xong Phase 1 → 4, chờ kiểm thử thủ công Mục 5C & xác nhận mở PR vào `main`
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Đã hoàn tất toàn bộ 4 phase trên nhánh `refactor/code-splitting`; entry `index-*.js` giảm từ **918.12 kB** (gzip 277.95 kB) xuống **259.00 kB** (gzip 76.61 kB), 0 cảnh báo > 500 kB.
- Đang chờ người dùng kiểm thử thủ công theo Checklist Mục 5C (`npm run preview -- --port 5173 --strictPort`) và xác nhận trước khi push / mở PR vào `main`.

## Chưa xác nhận (từ Phase 3)
- `https://ofu.lol` đã chạy ổn thực tế trên PC & mobile *(chưa xác nhận)*.
- Dọn Supabase hậu kỳ theo D-001: xoá project Supabase cũ và xoá secret `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` trên GitHub *(chưa xác nhận)*.

## Bước tiếp theo
1. Người dùng chạy kiểm thử thủ công Checklist Mục 5C trên `npm run preview -- --port 5173 --strictPort`.
2. Sau khi xác nhận OK → push nhánh `refactor/code-splitting` và mở PR merge vào `main` khi CI xanh.
3. Sau khi merge: triển khai Phase 4 (Thư viện 3D `FantasyLibrary3D`) trên nhánh mới theo D-004 + D-008.

## Lỗi / chặn
- Không có lỗi/chặn nào. Không sửa `workers/` hay `wrangler.toml`.

## Xong gần nhất
- **Phase 4:** điền bảng đo đạc chunk JS trước/sau vào `docs/plans/refactor-code-splitting.md`, rà soát toàn diện `docs/ARCHITECTURE.md` (Mục 1, 2, 6, 7), kiểm định xanh cả frontend và `workers/r2-storage`.
- **Phase 3:** lazy-load `PdfReader.tsx` + `pdfjs-dist`, mở rộng `ErrorBoundary.tsx` (`fallback` + `isChunkLoadError`), bọc boundary cục bộ quanh `LazyPdfReader`.
- **Phase 2:** tách `parsers.ts` (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml` dùng `dompurify` v3, `chunkReload`) + dynamic import theo định dạng.
- **Phase 1:** ghi **D-008** vào `docs/DECISIONS.md`.
