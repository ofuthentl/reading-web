# HANDOFF
Cập nhật: 2026-11-23 15:31 | Nhánh: feat/admin-usage-dashboard | Build: 🟢 typecheck · 🟢 ESLint 0/0 · 🟢 build (`85.89 kB` gzip) · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Hoàn tất trọn bộ cả 2 gói thay đổi trên `feat/admin-usage-dashboard`** (gồm toàn bộ bản vá audit + bỏ PDF `D-033` + font tiếng Việt cục bộ & 4 chế độ nền `D-034` + trang thống kê Admin `/usage` chống rò rỉ `D-035`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Toàn bộ 4/4 Phase của `/usage` (và 5/5 Phase của bản vá audit trước đó) đã hoàn tất, kiểm định tĩnh + bảo mật Worker + trình duyệt PC/Mobile ĐẠT 100%, sẵn sàng gộp 1 PR duy nhất lên `main` để publish cả 2 cùng lúc.

## Bước tiếp theo (Triển khai Production — chờ người dùng thực hiện)
1. **Chạy 3 migration D1 lên production** *(theo thứ tự)*:
   - `cd workers/r2-storage`
   - `npx wrangler d1 execute library-db --remote --file=./migrations/0008_drop_pdf.sql`
   - `npx wrangler d1 execute library-db --remote --file=./migrations/0009_perf_indexes.sql`
   - `npx wrangler d1 execute library-db --remote --file=./migrations/0010_usage_stats.sql`
2. **Deploy Cloudflare Worker:** `cd workers/r2-storage && npm run deploy`
3. **Push nhánh & mở 1 Pull Request duy nhất vào `main`:** `git push -u origin feat/admin-usage-dashboard` rồi merge PR khi CI xanh để auto-deploy `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào. Các điểm phát hiện trong kiểm định thực tế đã được vá dứt điểm: tách tiền tố `discord:` tránh đếm trùng DAU ở `index.ts`, xác thực `/api/auth/session` trước khi tải chunk `AdminUsageView` ở `AuthGate.tsx`, sửa màu cột SVG `--color-crimson` + bỏ khung xám nền ở `AdminUsageCharts.tsx`, đồng bộ màu icon `text-accent` ở `LibraryHeader.tsx` & `AdminUsageView.tsx`.

## Xong gần nhất
- **Trang `/usage` (`D-035`):** Migration `0010_usage_stats.sql`, `usageRecorder.ts`, `usageDb.ts`, `GET /api/admin/usage` (`requireOwner`, `no-store`/`noindex`, 0 trường nhạy cảm), Stealth `/usage` (`dist/usage/index.html`, `gateRoutes.ts`, `AuthGate.tsx`, `App.tsx`), giao diện nạp lười `AdminUsageView` (`7.99 kB` gzip) + biểu đồ SVG 0 CDN + bảng hoạt động khách Discord; đồng bộ `DECISIONS.md` & `ARCHITECTURE.md`.
