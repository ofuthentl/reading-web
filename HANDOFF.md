# HANDOFF
Cập nhật: 2026-11-21 00:53 | Nhánh: refactor/code-splitting | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Refactor code-splitting — đã bổ sung bảo vệ offline reload, preload idle & tách `PdfReaderFallback`, chờ kiểm thử thủ công Mục 5C
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Hoàn tất Phase 1 → 4 và bản vá hậu review trên `refactor/code-splitting`:
  - Entry `index-*.js` giảm từ **918.12 kB** (gzip 277.95 kB) xuống **259.77 kB** (gzip 76.92 kB).
  - `npm run build`: **0 lỗi, 0 cảnh báo chunk > 500 kB** (còn 1 cảnh báo externalize `stream` đã biết từ `sax` qua `@lingo-reader/mobi-parser` → `@lingo-reader/shared` → `sax`).
- Đang chờ người dùng kiểm thử thủ công theo Checklist Mục 5C (`npm run preview -- --port 5173 --strictPort`) trước khi push / mở PR vào `main`.

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
- **Fix hậu review:** chặn `reloadOnceForStaleChunk` khi offline (`navigator.onLine === false`), gom `recoverFromChunkError`, preload ngầm `parsers` + `jszip` khi rảnh sau khi tải thư viện 2D (`preloadCoreReaders`), không tự reload giữa lúc `uploadBook`, tách `PdfReaderFallback.tsx` khỏi `ReaderView.tsx`.
- **Phase 1 → 4:** ghi **D-008**, tách `parsers.ts` (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml` dùng `dompurify` v3, `chunkReload`), lazy-load `PdfReader.tsx`, đồng bộ `docs/ARCHITECTURE.md`.
