# HANDOFF
Cập nhật: 2026-11-21 00:16 | Nhánh: refactor/code-splitting | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Refactor code-splitting — kế hoạch đã sửa theo review 2026-11-21, chờ người dùng duyệt
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Đã tách nhánh `refactor/code-splitting` từ `origin/main` (sau khi Phase 3 — 2D + Cloudflare — đã merge vào `main` qua PR #1).
- Đã cập nhật `docs/plans/refactor-code-splitting.md` theo 7 quyết định chốt sau review (QĐ-1 → QĐ-7); chưa sửa code và chưa làm Phase 1.

## Chưa xác nhận (từ Phase 3)
- `https://ofu.lol` đã chạy ổn thực tế trên PC & mobile *(chưa xác nhận)*.
- Dọn Supabase hậu kỳ theo D-001: xoá project Supabase cũ và xoá secret `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` trên GitHub *(chưa xác nhận)*.

## Bước tiếp theo
1. Người dùng duyệt `docs/plans/refactor-code-splitting.md`.
2. Phase 1: ghi D-008 vào `docs/DECISIONS.md`.
3. Phase 2: tách `parsers.ts` (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml` dùng `dompurify`, `chunkReload`), dynamic import & xử lý chunk cũ.
4. Phase 3: lazy-load `PdfReader.tsx` trong `ReaderView.tsx` + `ErrorBoundary` xử lý lỗi chunk cũ.
5. Phase 4: đo đạc chunk JS trước/sau, rà soát `docs/ARCHITECTURE.md` & `HANDOFF.md` → mở PR `refactor/code-splitting` → `main`.
6. Sau khi merge: triển khai Phase 4 (Thư viện 3D `FantasyLibrary3D`) trên nhánh mới theo D-004 + D-008.

## Lỗi / chặn
- Chờ người dùng duyệt bản kế hoạch cuối trước khi bắt đầu Phase 1.

## Xong gần nhất
- Phase 3 (giao diện 2D + Cloudflare Worker/D1/R2) đã merge vào `main` qua PR #1; Worker live tại `https://arcane-library-api.novel-check-d467614e.workers.dev`.
- Rà soát & cập nhật kế hoạch `docs/plans/refactor-code-splitting.md` theo quyết định review 2026-11-21.
