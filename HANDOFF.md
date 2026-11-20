# HANDOFF
Cập nhật: 2026-11-20 20:38 | Nhánh: feat/migrate-cloudflare | Build: 🔴 (App.tsx còn import Supabase đã xoá; CI dự kiến đỏ tới 3.1)
Nhiệm vụ hiện tại: Chuẩn bị Phase 3 (giao diện 2D & deploy) — plan đã cập nhật: docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Đã cập nhật `docs/plans/phase-3-2d.md` theo 4 điểm review (vá auth Worker + tách `auth.ts` & dựng D1/R2 ngay từ 3.0; làm `App.tsx` tối giản xanh từ 3.1; dọn hậu kỳ Supabase ở 3.6).
- Code mới đã có sẵn nhưng **chưa nối vào `src/App.tsx` và chưa chạy thử**: `workers/r2-storage/src/index.ts`, `src/types.ts`, `src/lib/{api,cache,parsers}.ts`, `src/components/{PdfReader,ReaderView}.tsx`.

## Bước tiếp theo
1. Thực hiện Sub-phase 3.0: tách `workers/r2-storage/src/auth.ts`, vá fail-closed auth, tạo D1/R2, đặt secret và deploy Worker.
2. Thực hiện Sub-phase 3.1: `AuthGate` + `Toast` + `ErrorBoundary` + D-005 + vỏ `App.tsx` tối giản (build xanh).
3. Tiếp tục 3.2 → 3.6 theo `docs/plans/phase-3-2d.md`.

## Lỗi / chặn
- `src/App.tsx` (2.958 dòng) còn import `@/lib/supabase`, `@/lib/book-storage`, `@supabase/supabase-js` đã xoá → `typecheck`/`build`/CI frontend đang đỏ (sẽ xanh từ 3.1).
- `workers/r2-storage/wrangler.toml` còn `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"`; D1/R2 chưa khởi tạo và Worker chưa deploy (giải quyết ở 3.0).
- ESLint `max-lines` (500): `src/components/ReaderView.tsx` (673 dòng hiệu dụng, tách ở 3.4) và `workers/r2-storage/src/index.ts` (505 dòng hiệu dụng, tách ở 3.0).

## Xong trong nhiệm vụ này
- Branch protection cho `main` trên GitHub đã được người dùng bật.
- Phase 0–2: cứu hộ Git sang `feat/migrate-cloudflare`, tạo `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PROMPTS.md`, `README.md`, `HANDOFF.md`, ESLint `max-lines`, CI/deploy workflow, và chốt plan `docs/plans/phase-3-2d.md`.
