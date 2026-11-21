# HANDOFF
Cập nhật: 2026-11-21 15:18 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.55 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa gắn xương Mixamo thật cho **Asuna (`Idle` + `Walk`)** & **Yui (`Idle`)** đưa trọn bộ Kirito–Asuna–Yui vào Tháp Aincrad, cùng Phòng Boss 360° `D-021` → tiếp sang `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/boss-room-and-npc-polish.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Hoàn tất trọn Phase 1 → Phase 4 của `boss-room-and-npc-polish.md` + gắn xương Mixamo cho Asuna & Yui (`D-021`, XANH 100%):**
  - **Phòng Boss Đấu trường kín 360° (`bossRoomLayout3d.ts`, `BossArenaMesh.tsx`, `public/models/boss-arena.glb` 2.89 MiB):** gỡ toàn bộ Boss khỏi khu vực lộ thiên; cuối mỗi tầng đặt **Cửa Phòng Boss 2 cánh (`boss_door`)** mang ấn phong ấn đỏ-hổ phách (khoá) / lam-ngọc (mở).
  - **Quy tắc mở khoá linh hoạt toàn thư viện (KHÔNG cố định bộ sách nào cho tầng nào):** Tầng `N` mở khi tích luỹ đủ `N×(N+1)/2` tập hoàn thành HOẶC `× 150` trang đọc bất kỳ (Tầng 1: 1 tập/150 tr · Tầng 2: 3 tập/450 tr · Tầng 3: 6 tập/900 tr · Tầng 4: 10 tập/1.500 tr); bấm `[E]` khi khoá báo rõ tiến độ, khi mở chuyển cảnh vào Đấu trường 360° gặp Boss tầng đó (`Stone Golem` Tầng 1/3, `Drago Knight` Tầng 2, `Stormterror` Tầng 4) kèm cửa thoát quay về tầng.
  - **Dàn 6 NPC anime 0 T-pose/A-pose & bước đi thật:** chuyển đổi Mixamo FBX → GLB nén WebP + Meshopt cho **`npc-asuna.glb`** (915 KB, 52 xương, `Idle` 10s + `Walk` 1s đi dạo thật pha mượt `crossFadeTo(0.24s)`, dừng chào Kirito khi lại gần) và **`npc-yui.glb`** (515 KB, 52 xương, `Idle` 8.33s); hạ tay tự nhiên + thở/đảo đầu theo xương thật cho `Zhongli` (đứng gọn cạnh bàn đọc, thêm collider ghế `town-reading-bench`) & `SchoolGirl`, giữ `Mint` (clip 24s) & `Maid` (dáng tự nhiên); gắn **Cổng Torii** (`prop-torii-gate.glb`) Tầng 2 & texture PBR thật (`pbr-tile-*` Tầng 3, `pbr-stone-*` Tầng 2/4).
  - Kiểm định: `typecheck`, `lint` (0/0), `build` (`84.55 kB gzip`, `0 B three`, `0 CDN`), 21/21 test 4A-T1 (gồm Phòng Boss & tuyến đi dạo Asuna không va chạm) và 6/6 test 4A-T2.

## Bước tiếp theo
1. Người dùng chạy `npm run dev` kiểm tra trực quan: Cửa Phòng Boss & mốc đọc trên `WorldQuickBar`, Phòng Boss kín 360° (khi đạt mốc 1 tập / 150 trang), dàn NPC đứng tự nhiên hết T-pose/trượt cứng, Cổng Torii Tầng 2 & texture PBR Tầng 3/4.
2. **Sub-phase 4A-T4**: `MinimapWidget.tsx`, `CozyGameHud.tsx` (HP/Mana/XP nền + Nhiệm vụ đọc thu gọn), `ambientAudio.ts` (âm thanh môi trường Web Audio API), `InteractiveStations.tsx` (vòng sáng trạm tương tác 3D).
3. **Sub-phase 4A-T5**: kiểm thử toàn bộ checklist PR 4A → mở PR merge vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phòng Boss kín 360° khoá tiến độ đọc & tinh chỉnh NPC/Cảnh (`feat/library-3d`, D-021):** `bossRoomLayout3d.ts`, `BossArenaMesh.tsx`, `boss-arena.glb`, `prop-torii-gate.glb`, 6 ảnh PBR `pbr-tile`/`pbr-stone`, rig Idle xương thật cho `Zhongli`/`SchoolGirl`, bỏ dây leo treo & Boss ngoài trời.
- **Real GLB Kirito, Tầng 1 Phố Châu Âu, Đèn kệ sách & Gọn UI (`feat/library-3d`, D-019/D-020):** `player.glb` đứng thẳng tự nhiên, `town-world.glb`, đèn tường đồng cho mọi kệ sách, gỡ thanh lọc chắn tầm nhìn 3D & chips kệ thừa 2D.
