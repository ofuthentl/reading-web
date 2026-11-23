# HANDOFF
Cập nhật: 2026-11-23 15:18 | Nhánh: feat/admin-usage-dashboard | Build: 🟢 typecheck · 🟢 ESLint 0/0 · 🟢 build (`<= 86.04 kB` gzip) · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Triển khai trang thống kê Admin `/usage` chống rò rỉ thông tin (`docs/plans/admin-usage-dashboard.md`, Phương án 2)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- **Phase 1–3 (Xong):**
  - **Phase 1:** D1 `migrations/0010_usage_stats.sql` + `usageRecorder.ts` + `usageDb.ts` + `GET /api/admin/usage` (`requireOwner`, `no-store`/`noindex`).
  - **Phase 2:** Stealth `/usage` (`vite.config.ts` xuất `dist/usage/index.html`, `gateRoutes.ts`, `AuthGate.tsx` đẩy người lạ về `/locked` và khách về `/`, `App.tsx`, nút `Activity` chỉ hiện cho Owner trên `LibraryHeader`, `usageApi.ts`).
  - **Phase 3:** `AdminUsageView.tsx` (lazy chunk `0 B` ở entry), `AdminUsageCharts.tsx` (SVG 0 CDN, 7/14/30 ngày + phân bổ R2 & an toàn) và `AdminUsageGuestTable.tsx` (lọc nhanh thành viên Discord).
- **Tiếp theo:** Phase 4 — kiểm định bảo mật & runtime (Worker local + Trình duyệt cho Người lạ / Khách / Admin PC + Mobile) và cập nhật `DECISIONS.md` (`D-035`) + `ARCHITECTURE.md`.

## Bước tiếp theo
1. Chạy bộ kiểm định bảo mật Worker (`401`/`403`/`200` + header + 0 trường nhạy cảm + migration `0010`) và trình duyệt thực tế (`http://127.0.0.1:5173/usage`).
2. Cập nhật `docs/DECISIONS.md` (`D-035`), `docs/ARCHITECTURE.md` & `HANDOFF.md` rồi commit Phase 4.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 2 & 3:** Hoàn tất Stealth routing `/usage` và giao diện dashboard Admin nạp lười `AdminUsageView` (0 CDN, hỗ trợ đủ 4 nền).
