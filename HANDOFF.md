# HANDOFF
Cập nhật: 2026-11-21 00:28 | Nhánh: refactor/code-splitting | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Refactor code-splitting — xong Phase 2 (tách `parsers.ts`, `DOMPurify`, dynamic import, `chunkReload`), tiếp tục Phase 3
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Phase 2 đã tách `src/lib/parsers.ts` thành `bookMetadata.ts`, `coverImage.ts`, `pdfjsLoader.ts`, `sanitizeHtml.ts` (`dompurify` v3), `chunkReload.ts`, chuyển `api.ts`/`useBookReader.ts`/parser engines sang dynamic import và thêm listener `vite:preloadError` ở `src/main.tsx`.

## Chưa xác nhận (từ Phase 3)
- `https://ofu.lol` đã chạy ổn thực tế trên PC & mobile *(chưa xác nhận)*.
- Dọn Supabase hậu kỳ theo D-001: xoá project Supabase cũ và xoá secret `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` trên GitHub *(chưa xác nhận)*.

## Bước tiếp theo
1. Phase 3: chuyển `PdfReader.tsx` sang `loadPdfJs()`, lazy-load trong `ReaderView.tsx` (`React.lazy` + `Suspense`), mở rộng `ErrorBoundary` (prop `fallback` & `isChunkLoadError`), bọc boundary cục bộ quanh `LazyPdfReader`.
2. Phase 4: đo đạc chunk JS trước/sau, rà soát `docs/ARCHITECTURE.md` & `HANDOFF.md`, kiểm thử thủ công → chờ duyệt mở PR `refactor/code-splitting` → `main`.
3. Sau khi merge: Phase 4 (Thư viện 3D `FantasyLibrary3D`) trên nhánh mới theo D-004 + D-008.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 2 (`refactor/code-splitting`):** tách module đúng trách nhiệm (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml` dùng `dompurify` v3, `chunkReload`), dynamic import theo định dạng, đồng bộ `docs/ARCHITECTURE.md`.
- **Phase 1 (`refactor/code-splitting`):** ghi chính thức quyết định **D-008** vào `docs/DECISIONS.md`.
