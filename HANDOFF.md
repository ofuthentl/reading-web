# HANDOFF
Cập nhật: 2026-11-23 15:07 | Nhánh: feat/admin-usage-dashboard | Build: 🟢 ESLint 0/0 · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Triển khai trang thống kê Admin `/usage` chống rò rỉ thông tin (`docs/plans/admin-usage-dashboard.md`, Phương án 2)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- **Phase 1 (Xong):** Đã thêm `migrations/0010_usage_stats.sql` + `schema.sql` (`usage_daily_stats`, `usage_daily_readers`), `usageRecorder.ts` + `usageDb.ts`, gắn `scheduleUsageEvent` qua `ctx.waitUntil` ở `index.ts` & `discord.ts`, và thêm endpoint `GET /api/admin/usage` (`requireOwner`, `Cache-Control: no-store, private`, `X-Robots-Tag: noindex, nofollow`).
- **Tiếp theo:** Phase 2 (Stealth routing `/usage`, `vite.config.ts`, `gateRoutes.ts`, `AuthGate.tsx`, `usageApi.ts`, `App.tsx`, nút Owner trên `LibraryHeader`) và Phase 3 (`AdminUsageView.tsx` + `AdminUsageCharts.tsx`).

## Bước tiếp theo
1. Hoàn tất Phase 2 & Phase 3 rồi kiểm định bảo mật + trình duyệt PC/Mobile (Phase 4).
2. Khi toàn bộ xong: chạy migration `0008`, `0009`, `0010` lên D1 production, deploy Worker, rồi mở 1 PR từ `feat/admin-usage-dashboard` vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 1 (`/usage` Backend):** D1 migration `0010_usage_stats.sql`, `usageRecorder.ts`, `usageDb.ts` và `GET /api/admin/usage` sạch lỗi ESLint & Worker `tsc`.
