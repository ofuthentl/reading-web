# HANDOFF
Cập nhật: 2026-11-21 12:55 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.70 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa hoàn tất **Real GLB Kirito + Tầng 1 Phố Châu Âu `D-019`**, chờ kiểm tra trực quan → tiếp tục `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/library-series-tab.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Nâng cấp Real GLB Kirito & Tầng 1 Phố Châu Âu (`D-019`, Phương án A) hoàn tất & XANH 100%:**
  - **`public/models/player.glb` (316 KB)** + `AnimatedPlayerGlb.tsx` (149 dòng) + `KiritoAvatar.tsx`: hợp nhất 4 file Mixamo FBX (`Idle`, `Walk`, `Run`, `Sprint`) thành 1 bộ xương 25 xương chuẩn (0 lệch bind pose) + 4 ảnh PNG gốc nén WebP 1024 + Meshopt, cao đúng 1.70 m, tự pha mượt `crossFadeTo(0.18s)`, giữ bản procedural làm fallback.
  - **`public/models/town-world.glb` (13.09 MiB)** + `TownWorldGlb.tsx` (133 dòng) + `biomeBlueprints.ts`: nén `after_the_rain` (153.6 MiB → 13.09 MiB, chuyển `metalrough` + WebP 1024 + Meshopt), lọc `anisotropy` 8x, chuyển tán lá/cỏ sang `alphaTest` chống lỗi độ sâu, bật sáng 22 đèn đường & 4 đèn ấm vào Chiều/Đêm, căn đại lộ lát đá khớp chuẩn 6 gian kệ sách, Bàn đọc, Bục Thủ thư, Dragon Mascot, 4 NPC và collider mặt tiền (`blocksCamera = true`).
  - **Ánh sáng & phản chiếu PBR 0-CDN:** thêm `skyEnvironment.ts` (`THREE.PMREMGenerator` nội bộ cho `scene.environment`), bật đổ bóng mềm `PCFSoftShadowMap` (`2048×2048`, tắt khi `prefers-reduced-motion`) và mở rộng `SkyDome` 460 m / `camera.far = 560` để hiển thị trọn khinh khí cầu xa.
  - Kiểm định: `typecheck`, `lint` (0 lỗi, 0 cảnh báo), `build` (entry `84.70 kB gzip`, `0 B three`), 19/19 test vật lý/va chạm/camera (4A-T1) và 6/6 test hình học/GLB/0-CDN (4A-T2).

## Bước tiếp theo
1. Người dùng tải lại `npm run dev` kiểm tra trực quan **Kirito thật** (`Idle`/`Walk`/`Run`/`Sprint` khi bấm `WASD` + `Shift`) và **Tầng 1 Thị trấn Khởi Đầu** (Ban ngày / Chiều tối / Đêm khuya + đèn đường sáng + bóng đổ + 6 kệ sách + khinh khí cầu), quyết định có đồng bộ thêm NPC `.glb` hay GLB cho tầng 2–4.
2. **Sub-phase 4A-T4**: `MinimapWidget.tsx`, `CozyGameHud.tsx` (HP/Mana/XP nền + Nhiệm vụ đọc thu gọn), `ambientAudio.ts` (âm thanh môi trường Web Audio API), `InteractiveStations.tsx` (vòng sáng & hitboxes trạm tương tác 3D).
3. **Sub-phase 4A-T5**: kiểm thử toàn bộ checklist PR 4A → mở PR merge vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Real GLB Kirito & Tầng 1 Phố Châu Âu (`feat/library-3d`, D-019):** xây `player.glb` (316 KB, 4 anim Mixamo) & `town-world.glb` (13.09 MiB), thêm `AnimatedPlayerGlb.tsx`, `TownWorldGlb.tsx`, `skyEnvironment.ts`, đổ bóng mềm & khớp bố cục Tầng 1.
- **Sub-phase 4A-T1 → 4A-T3 (`feat/library-3d`):** thế giới 4 Biome, vật lý OBB/dốc/cầu, 3 model `.glb`, `PlayerRig`, NPC, `frameloop` 0 FPS, `clearLocalGlbCache()`.
- **Tab Thư viện 2D (`feat/library-3d`, D-018):** cặp tab `Trang chủ` | `Thư viện`, bìa Tập 1 & drill-down tại chỗ (`6.03 kB gzip`).
