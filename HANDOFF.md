# HANDOFF
Cập nhật: 2026-11-20 21:00 | Nhánh: feat/migrate-cloudflare | Build: 🔴 frontend (App.tsx cũ; xanh từ 3.1) · 🟢 Worker
Nhiệm vụ hiện tại: Phase 3 (giao diện 2D & deploy) — xong Sub-phase 3.0 theo docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Chưa nối UI 2D vào `src/App.tsx`; Worker đã deploy live tại `https://arcane-library-api.novel-check-d467614e.workers.dev` và `.env.local` đã trỏ vào Worker để test các bước 3.1–3.5.
- Code mới đã có sẵn: `workers/r2-storage/src/{auth,index}.ts`, `src/types.ts`, `src/lib/{api,cache,parsers}.ts`, `src/components/{PdfReader,ReaderView}.tsx`.

## Bước tiếp theo
1. Thực hiện Sub-phase 3.1: `AuthGate` + `Toast` + `ErrorBoundary` + D-005 + vỏ `App.tsx` tối giản (đưa frontend build & dev server sang xanh, gỡ override `max-lines` cho `App.tsx`).
2. Tiếp tục Sub-phase 3.2 → 3.6 theo `docs/plans/phase-3-2d.md`.

## Lỗi / chặn
- `src/App.tsx` (2.958 dòng) còn import `@/lib/supabase`, `@/lib/book-storage`, `@supabase/supabase-js` đã xoá → `typecheck`/`build`/CI frontend đang đỏ (sẽ xanh ở 3.1).
- ESLint `max-lines` (500): chỉ còn `src/components/ReaderView.tsx` (673 dòng hiệu dụng, tách ở 3.4).

## Xong trong nhiệm vụ này
- **Sub-phase 3.0**: tách `workers/r2-storage/src/auth.ts`, vá fail-closed auth (`503` khi thiếu `ACCESS_PASSCODE`, bỏ `'local-dev-secret'`), tạo D1 `library-db` (APAC) + init schema remote, tạo R2 `arcane-library-books` (APAC), đặt secret `ACCESS_PASSCODE` & `AUTH_SECRET`, deploy Worker `arcane-library-api` và kiểm thử `/api/health`, `/api/books` (`401`), `/api/auth/login` (`401`), CORS (`204`).
- Branch protection cho `main` trên GitHub đã được bật; Phase 0–2 đã hoàn tất.
