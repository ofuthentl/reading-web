# HANDOFF
Cập nhật: 2026-11-20 21:15 | Nhánh: feat/migrate-cloudflare | Build: 🟢 frontend · 🟢 Worker (ESLint chỉ còn ReaderView.tsx tách ở 3.4)
Nhiệm vụ hiện tại: Phase 3 (giao diện 2D & deploy) — xong Sub-phase 3.0 & 3.1 theo docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Tên thương hiệu chuẩn: **Ofu's Library**. Palette UI chuẩn: tông **`stone` tối giản** (giống bản gốc `e225080`: sáng `bg-stone-50` / `bg-white` / `border-stone-200` / nút `bg-stone-900`; tối `bg-stone-950` / `bg-stone-900` / `border-stone-800` — **không dùng** tím/xanh indigo kiểu AI mặc định).
- Worker live tại `https://arcane-library-api.novel-check-d467614e.workers.dev` (`.env.local` đã trỏ sẵn).

## Bước tiếp theo
1. Thực hiện Sub-phase 3.2: `useCoverUrl` + `BookCard` + `LibraryHeader` + `Library2DView` (kệ sách, Tiếp tục đọc, tìm kiếm, thanh dung lượng `X / 9.0 GB`, hỗ trợ nút sáng/tối `stone` như bản gốc) và nối vào `App.tsx`.
2. Tiếp tục Sub-phase 3.3 → 3.6 theo `docs/plans/phase-3-2d.md`.

## Lỗi / chặn
- ESLint `max-lines` (500): chỉ còn duy nhất `src/components/ReaderView.tsx` (673 dòng hiệu dụng, tách ở 3.4).

## Xong trong nhiệm vụ này
- **Sub-phase 3.1 + fix branding/palette**: áp dụng D-005, tạo `ErrorBoundary`, `useToast`, `ToastContainer`, `AuthGate`, vỏ `App.tsx` tối giản, khôi phục tên **Ofu's Library** + palette `stone` gốc (`index.html`, `manifest.webmanifest`, các component 3.1), gỡ override `max-lines` cho `App.tsx`.
- **Sub-phase 3.0**: tách `workers/r2-storage/src/auth.ts` (fail-closed), tạo D1 `library-db` + R2 `arcane-library-books`, đặt secret và deploy Worker.
- Phase 0–2 + Branch protection cho `main` đã hoàn tất.
