# HANDOFF
Cập nhật: 2026-11-21 13:10 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.70 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (đã tinh chỉnh dáng đứng `Idle` Kirito & gắn đèn rọi kệ sách `D-019`, chờ kiểm tra trực quan → `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/library-series-tab.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Nâng cấp & tinh chỉnh Real GLB Kirito + Tầng 1 Phố Châu Âu (`D-019`) hoàn tất & XANH 100%:**
  - **`public/models/player.glb` (269 KB)** + `AnimatedPlayerGlb.tsx` + `KiritoAvatar.tsx`: tổng hợp lại clip `Idle` đứng thẳng tự nhiên (hết chùng gối & hết đưa tay ra trước, hai tay thả thoải mái hai bên cách vạt áo ~3.5 cm, thở nhẹ & đảo mắt tự nhiên, giữ nguyên `Walk`/`Run`/`Sprint` Mixamo).
  - **Đèn chiếu kệ sách toàn tháp:** thêm cặp đèn tường đồng cổ điển + dải đèn ấm dưới mái hiên cho mọi kệ (`worldGeometryBuilder.ts`), gắn `pointLight` vàng ấm rọi từng kệ (`WorldBiomeMesh.tsx`), tắt bóng tự che từ mái hiên `woodCrown`, tăng độ ấm gỗ & tự phát sáng nhẹ biển tên kệ/bìa tiêu điểm về đêm (`proceduralMaterials.ts`, `InstancedBooksMesh.tsx`).
  - **`public/models/town-world.glb` (13.09 MiB)** + `TownWorldGlb.tsx` + `skyEnvironment.ts`: phố châu Âu lát đá thật cho Tầng 1, IBL `PMREMGenerator` 0 CDN, đổ bóng mềm `2048×2048`, 22 đèn đường bật sáng về Chiều/Đêm.
  - Kiểm định: `typecheck`, `lint` (0/0), `build` (entry `84.70 kB gzip`, `0 B three`), 19/19 test 4A-T1 & 6/6 test 4A-T2.

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
