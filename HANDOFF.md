# HANDOFF
Cập nhật: 2026-11-21 00:23 | Nhánh: refactor/code-splitting | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Refactor code-splitting — xong Phase 1 (D-008), tiếp tục Phase 2
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Đã đo baseline `dist/assets/index-*.js` = 918.12 kB (gzip 277.95 kB) và hoàn tất Phase 1 (ghi D-008 vào `docs/DECISIONS.md`).

## Chưa xác nhận (từ Phase 3)
- `https://ofu.lol` đã chạy ổn thực tế trên PC & mobile *(chưa xác nhận)*.
- Dọn Supabase hậu kỳ theo D-001: xoá project Supabase cũ và xoá secret `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` trên GitHub *(chưa xác nhận)*.

## Bước tiếp theo
1. Phase 2: cài `dompurify`, tách `parsers.ts` (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml`, `chunkReload`), dynamic import & cập nhật `docs/ARCHITECTURE.md`.
2. Phase 3: lazy-load `PdfReader.tsx` trong `ReaderView.tsx` + mở rộng `ErrorBoundary` (prop `fallback` & `isChunkLoadError`).
3. Phase 4: đo đạc chunk JS trước/sau, rà soát `docs/ARCHITECTURE.md` & `HANDOFF.md`, kiểm thử thủ công → mở PR `refactor/code-splitting` → `main`.
4. Sau khi merge: Phase 4 (Thư viện 3D `FantasyLibrary3D`) trên nhánh mới theo D-004 + D-008.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 1 (`refactor/code-splitting`):** ghi chính thức quyết định **D-008** (điều kiện bật 3D Desktop-only & chặn mobile tải Three.js) vào `docs/DECISIONS.md`.
