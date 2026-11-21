# HANDOFF
Cập nhật: 2026-11-22 00:11 | Nhánh: feat/discord-key-access | Build: 🟢 frontend (entry 83.40 kB gzip <= 86.04 kB, 0 B three) · 🟢 worker (live) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất & Deploy Worker cho Bot Discord (`feat/discord-key-access`, `D-026`)** — chờ gắn `Interactions Endpoint URL` trên Discord Portal & mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/discord-key-access.md

## Đang làm dở
- Đã hoàn tất Phase 1 → 4 và **deploy live Cloudflare Worker** (`arcane-library-api`, `/api/health` trả `discordReady: true`):
  - Vá `verifyDiscordSignature` khớp 1:1 SDK chuẩn của Discord (bỏ bộ lọc tuổi `timestamp` khiến bản tin test của Discord Portal bị chặn `401`) và chuẩn hoá đường dẫn `/api/discord/interactions` chịu được dấu `/` cuối.
  - Đã tạo đủ bảng `shelf_prefs`, `discord_access`, `guest_reading_progress` trên D1 remote.

## Bước tiếp theo
1. Trên Discord Developer Portal (*General Information* → *Interactions Endpoint URL*), dán đúng:
   `https://arcane-library-api.novel-check-d467614e.workers.dev/api/discord/interactions` → bấm **Save Changes**.
2. Chạy `npm run discord:register` trong `workers/r2-storage` rồi gõ `/setup-bell` trong kênh Discord.
3. Push nhánh `feat/discord-key-access` lên GitHub và mở/merge Pull Request vào `main` để cập nhật giao diện trên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/discord-key-access` (`D-026`):** hoàn tất code Frontend + Worker, nạp đủ secret Discord, migrate D1 remote & deploy Worker live.
