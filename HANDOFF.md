# HANDOFF
Cập nhật: 2026-11-21 23:57 | Nhánh: feat/discord-key-access | Build: 🟢 frontend (entry 83.40 kB gzip <= 86.04 kB, 0 B three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất chia sẻ thư viện qua Bot Discord (`feat/discord-key-access`, `D-026`)** — sẵn sàng gắn Discord App, migrate D1 remote, deploy Worker & mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/discord-key-access.md

## Đang làm dở
- Đã hoàn tất trọn vẹn cả 4 Phase trên nhánh `feat/discord-key-access` (`D-026`):
  1. **D1 & Worker Auth 2 vai trò (`0003_discord_guest_access.sql`, `auth.ts`, `booksDb.ts`, `index.ts`):** `ACCESS_PASSCODE` cấp `owner` **30 ngày** (toàn quyền DB + 3D); key Discord 12 ký tự hạn **5 phút** dùng **1 lần** cấp `guest` **24 giờ** (tự đóng phiên 24 giờ cũ của cùng Discord user), chặn `403` mọi API ghi kho chung và cách ly tiến độ đọc vào `guest_reading_progress`.
  2. **Bot Discord Serverless (`discord.ts` + `scripts/register-discord-commands.mjs`):** webhook `POST /api/discord/interactions` xác thực chữ ký `Ed25519` (`crypto.subtle`, `$0` 24/7, 0 thư viện ngoài), lệnh `/setup-bell` đặt bảng chuông `🔔 Nhận chìa khoá`, lệnh `/key` & nút bấm trả key ẩn (`flags: 64`, cooldown `15s`).
  3. **Frontend giữ nguyên UI sẵn có (`authSession.ts`, `AuthGate.tsx`, `App.tsx`, `LibraryHeader.tsx`):** nhận chung cả 2 loại mã tại `AuthGate`; khoá cứng `guest` ở **Chỉ Đọc 2D** (ẩn công tắc `2D/3D`, không tải `three`, ẩn toàn bộ nút quản trị, đếm ngược phiên 24 giờ & tự thoát khi hết giờ).
  4. **Kiểm định & Tài liệu:** vượt 10/10 bài kiểm thử E2E trên `workerd + D1 + Ed25519` + kiểm định bundle; đã đồng bộ `docs/ARCHITECTURE.md`.

## Bước tiếp theo
1. Thiết lập Discord App & deploy Cloudflare Worker theo mục 5 của `docs/plans/discord-key-access.md`:
   - `cd workers/r2-storage && npx wrangler d1 migrations apply library-db --remote`
   - `npx wrangler secret put DISCORD_PUBLIC_KEY` · `DISCORD_GUILD_ID` · `DISCORD_BOT_TOKEN` → `npx wrangler deploy`
   - Gắn `Interactions Endpoint URL` = `https://<worker-domain>/api/discord/interactions`, chạy `npm run discord:register` rồi gõ `/setup-bell` trong kênh Discord.
2. Mở & merge Pull Request `feat/discord-key-access` → `main` khi CI xanh.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/discord-key-access` (`D-026`):** hệ thống lấy key 5 phút qua Bot Discord + phiên khách 24 giờ Chỉ Đọc 2D + cách ly tiến độ đọc theo từng tài khoản Discord.
- **`feat/shelf-cover-and-metadata` (`D-025`, PR #6):** đã merge vào `main`.
