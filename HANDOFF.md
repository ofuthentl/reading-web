# HANDOFF
Cập nhật: 2026-11-20 20:26 | Nhánh: feat/migrate-cloudflare | Build: 🔴 (App.tsx còn import Supabase đã xoá; CI dự kiến đỏ)
Nhiệm vụ hiện tại: Thiết lập quy trình (Phase 0–2 xong), chuẩn bị Phase 3 (giao diện 2D & deploy) — plan: docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Chờ người dùng duyệt `docs/plans/phase-3-2d.md` trước khi code sub-phase 3.1.
- Code mới đã có sẵn nhưng **chưa nối vào `src/App.tsx` và chưa chạy thử**: `workers/r2-storage/src/index.ts`, `src/types.ts`, `src/lib/{api,cache,parsers}.ts`, `src/components/{PdfReader,ReaderView}.tsx`.

## Bước tiếp theo
1. Người dùng bật Branch protection cho `main` trên GitHub.
2. Người dùng review chéo và duyệt `docs/plans/phase-3-2d.md`.
3. Bắt đầu sub-phase 3.1 (`AuthGate` + `Toast` + `ErrorBoundary`) sau khi được duyệt.

## Lỗi / chặn
- `src/App.tsx` (2.958 dòng) còn import `@/lib/supabase`, `@/lib/book-storage`, `@supabase/supabase-js` đã xoá → `typecheck`/`build`/CI frontend đang đỏ.
- `workers/r2-storage/wrangler.toml` còn `database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"`; D1/R2 chưa khởi tạo và Worker chưa deploy.
- ESLint `max-lines` (500): `src/components/ReaderView.tsx` (673 dòng hiệu dụng) và `workers/r2-storage/src/index.ts` (505 dòng hiệu dụng) đang vượt ngưỡng — đã lên lịch tách trong sub-phase 3.4 & 3.5.

## Xong trong nhiệm vụ này
- Phase 0: cứu hộ Git sang nhánh `feat/migrate-cloudflare`, bổ sung `.gitignore` (`.wrangler/`, `.dev.vars`, `.env.*`, `!.env.example`).
- Phase 1: tạo `AGENTS.md`, cấu hình ESLint `max-lines` (+ override tạm `src/App.tsx`), tạo `.github/workflows/ci.yml`, thêm typecheck/lint vào `deploy.yml`, chuyển và rút gọn `docs/PROMPTS.md`.
- Phase 2: tạo `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, viết lại `HANDOFF.md` gọn, viết lại `README.md` (bỏ hoàn toàn Supabase), lập kế hoạch `docs/plans/phase-3-2d.md`.
- Hạ tầng code đã viết sẵn từ trước (chưa nối, chưa chạy thử): backend Cloudflare Worker/D1/R2, lib core (`api`, `cache`, `parsers`), trình đọc mới (`ReaderView`, `PdfReader`).
