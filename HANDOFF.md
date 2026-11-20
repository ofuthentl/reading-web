# HANDOFF
Cập nhật: 2026-11-20 20:23 | Nhánh: feat/migrate-cloudflare | Build: 🔴 (App.tsx còn import Supabase đã xoá; CI trên nhánh này dự kiến đỏ)
Nhiệm vụ hiện tại: Thiết lập quy trình dự án (Phase 0–2) — plan: chưa tạo (Phase 2)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md (chưa tạo) · docs/DECISIONS.md (chưa tạo) · docs/plans/

## Đang làm dở
- Phase 2: chuẩn bị đọc toàn bộ mã nguồn core và tạo `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `README.md`, `docs/plans/phase-3-2d.md`, hoàn thiện `HANDOFF.md`.

## Bước tiếp theo
1. Thực hiện Phase 2 (đọc code core, tạo sổ kiến trúc, sổ quyết định, README mới, plan Phase 3).
2. Commit & push Phase 2.

## Lỗi / chặn
- `src/App.tsx` chưa nối sang backend mới (còn import `@/lib/supabase`, `@/lib/book-storage`, `@supabase/supabase-js`) → typecheck/build/CI frontend đang đỏ (trạng thái đã biết).
- `workers/r2-storage/wrangler.toml` còn placeholder `REPLACE_WITH_YOUR_D1_DATABASE_ID`; Worker chưa deploy.

## Xong trong nhiệm vụ này
- Phase 0: cứu hộ Git sang nhánh `feat/migrate-cloudflare`, bổ sung `.gitignore`.
- Phase 1: tạo `AGENTS.md`, thêm ESLint `max-lines` (kèm override tạm cho `src/App.tsx`), tạo `.github/workflows/ci.yml`, thêm typecheck/lint vào `deploy.yml`, rút gọn `docs/PROMPTS.md`.
