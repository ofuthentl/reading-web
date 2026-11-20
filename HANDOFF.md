# HANDOFF
Cập nhật: 2026-11-21 00:31 | Nhánh: refactor/code-splitting | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Refactor code-splitting — xong Phase 3 (lazy `PdfReader` + `ErrorBoundary` fallback), tiếp tục Phase 4
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Phase 3 đã chuyển `PdfReader.tsx` sang `loadPdfJs()` (tách sạch `pdfjs-dist` khỏi entry bundle), lazy-load `PdfReader` trong `ReaderView.tsx` với `<ErrorBoundary fallback={...}>` cục bộ + `<Suspense>`, và thêm `fallback` + `isChunkLoadError` vào `ErrorBoundary.tsx`.

## Chưa xác nhận (từ Phase 3)
- `https://ofu.lol` đã chạy ổn thực tế trên PC & mobile *(chưa xác nhận)*.
- Dọn Supabase hậu kỳ theo D-001: xoá project Supabase cũ và xoá secret `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` trên GitHub *(chưa xác nhận)*.

## Bước tiếp theo
1. Phase 4: điền số đo chunk thực tế vào Bảng B của plan, rà soát toàn diện `docs/ARCHITECTURE.md` (Mục 1, 2, 6, 7), chạy `cd workers/r2-storage && npx tsc --noEmit`, cập nhật `HANDOFF.md`.
2. Kiểm thử thủ công theo Checklist Mục 5C trên `npm run preview -- --port 5173 --strictPort` → người dùng xác nhận rồi mới mở PR `refactor/code-splitting` → `main`.
3. Sau khi merge: Phase 4 (Thư viện 3D `FantasyLibrary3D`) trên nhánh mới theo D-004 + D-008.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 3 (`refactor/code-splitting`):** lazy-load `PdfReader.tsx` + `pdfjs-dist`, mở rộng `ErrorBoundary.tsx` (`fallback` + `isChunkLoadError`), bọc boundary cục bộ quanh `LazyPdfReader`, đồng bộ `docs/ARCHITECTURE.md`.
- **Phase 2 (`refactor/code-splitting`):** tách `parsers.ts` (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml` dùng `dompurify` v3, `chunkReload`) + dynamic import theo định dạng.
- **Phase 1 (`refactor/code-splitting`):** ghi **D-008** vào `docs/DECISIONS.md`.
