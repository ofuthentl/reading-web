# HANDOFF
Cập nhật: 2026-11-20 21:10 | Nhánh: feat/migrate-cloudflare | Build: 🟢 frontend · 🟢 Worker (ESLint chỉ còn ReaderView.tsx tách ở 3.4)
Nhiệm vụ hiện tại: Phase 3 (giao diện 2D & deploy) — xong Sub-phase 3.1 theo docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Đã có vỏ `src/App.tsx` tối giản (< 100 dòng) nối `AuthGate` + `ToastContainer` + `ErrorBoundary` + D-005; Worker live tại `https://arcane-library-api.novel-check-d467614e.workers.dev` (`.env.local` đã trỏ sẵn).
- Chưa nối giao diện kệ sách 2D (`Library2DView`), upload/modal quản lý sách và `ReaderView`.

## Bước tiếp theo
1. Thực hiện Sub-phase 3.2: `useCoverUrl` + `BookCard` + `LibraryHeader` + `Library2DView` (kệ sách, Tiếp tục đọc, tìm kiếm, thanh dung lượng `X / 9.0 GB`) và nối vào `App.tsx`.
2. Tiếp tục Sub-phase 3.3 → 3.6 theo `docs/plans/phase-3-2d.md`.

## Lỗi / chặn
- ESLint `max-lines` (500): chỉ còn duy nhất `src/components/ReaderView.tsx` (673 dòng hiệu dụng, tách ở 3.4).

## Xong trong nhiệm vụ này
- **Sub-phase 3.1**: áp dụng D-005 trong `src/lib/api.ts`, tạo `ErrorBoundary`, `useToast`, `ToastContainer`, `AuthGate`, viết lại `src/App.tsx` tối giản (< 100 dòng), bọc `ErrorBoundary` ở `src/main.tsx`, gỡ override `max-lines` của `App.tsx` trong `eslint.config.js` (`typecheck` & `build` frontend xanh 100%).
- **Sub-phase 3.0**: tách `workers/r2-storage/src/auth.ts` (fail-closed), tạo D1 `library-db` + R2 `arcane-library-books`, đặt secret và deploy Worker `arcane-library-api`.
- Phase 0–2 + Branch protection cho `main` đã hoàn tất.
