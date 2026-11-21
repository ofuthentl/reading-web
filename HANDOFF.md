# HANDOFF
Cập nhật: 2026-11-22 00:35 | Nhánh: feat/entrance-and-locked-routes | Build: 🟢 frontend (entry <= 86.04 kB gzip, 0 B three) · 🟢 worker (live) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất cổng `/entrance` & `/locked` (`feat/entrance-and-locked-routes`, `D-027`)** — sẵn sàng mở & merge PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/entrance-and-locked-routes.md

## Đang làm dở
- Đã hoàn tất trọn vẹn cả 2 Phase trên nhánh `feat/entrance-and-locked-routes` (`D-027`):
  1. **Định tuyến tĩnh GitHub Pages (`src/lib/gateRoutes.ts`, `vite.config.ts`, `index.html`):** xuất `dist/entrance/index.html`, `dist/locked/index.html` và `dist/404.html` (`HTTP 200 OK` khi mở thẳng `/entrance` từ Discord hoặc F5, tốn `0 B` thư viện ngoài).
  2. **Giao diện cổng tối giản kiểu TMW (`src/components/AuthGate.tsx`, `src/App.tsx`):**
     - **`/locked` (`Ofu's Library Closed.`):** tự động đón mọi lượt truy cập chưa đăng nhập vào `/`, đăng xuất, hết hạn 24 giờ hoặc đóng phiên `401`; hoàn toàn không có ô nhập hay nút sang `/entrance`.
     - **`/entrance` (`Ofu's Library Entrance.`):** nền giấy kẻ dọc + chữ chìm `書庫` + dấu triện đỏ, khung `ACCESS CODE` 12 ô nhận cả key Discord 12 ký tự lẫn `ACCESS_PASSCODE` Admin độ dài bất kỳ, đồng bộ đủ 3 chế độ Sáng/Chiều/Đêm; đăng nhập thành công tự đưa về `/`.
  3. **Cloudflare Worker (`discord.ts`):** đã deploy live bản cập nhật trỏ link `[cổng thư viện]` về `https://ofu.lol/entrance`.

## Bước tiếp theo
1. Mở & merge Pull Request `feat/entrance-and-locked-routes` → `main` để xuất bản `/entrance` và `/locked` lên `ofu.lol`.
2. *(Tuỳ chọn)* Xoá bảng chuông cũ trong kênh Discord và gõ lại `/setup-bell` 1 lần để bảng cố định cũng cập nhật link sang `https://ofu.lol/entrance` (các tin nhắn ẩn trả key mới đã tự trỏ về `/entrance` rồi).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/entrance-and-locked-routes` (`D-027`):** tách cổng `Ofu's Library Entrance.` (`/entrance`) và `Ofu's Library Closed.` (`/locked`).
- **PR #7 (`feat/discord-key-access`, `D-026`):** đã merge vào `main`.
