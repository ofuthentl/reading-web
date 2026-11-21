# HANDOFF
Cập nhật: 2026-11-21 13:34 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.4 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa gọn HUD 3D & bỏ chips lọc kệ 2D `Trang chủ`, đã rà soát toàn bộ 22 model trong `glb/{npc,monster,scene}` chờ duyệt phương án tích hợp)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/library-series-tab.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Gọn giao diện 2D & 3D hoàn tất & XANH 100%:**
  - `Library3DOverlay.tsx` & `FantasyLibrary3D.tsx`: gỡ bỏ thanh tìm kiếm + dải chips kệ + `< >` + `Đổi tên kệ` chắn tầm nhìn phía trên 3D; chỉ giữ `WorldQuickBar` gọn nhẹ trên đỉnh.
  - `Library2DView.tsx`: gỡ bỏ dải chips `Tất cả kệ (...)` ở tab `Trang chủ` (đã có tab `Thư viện` riêng theo `D-018`).
- **Đã kiểm kê 22 file `.glb` mới trong `glb/npc/`, `glb/monster/`, `glb/scene/`** và sẵn sàng đề xuất lộ trình nén WebP+Meshopt / tích hợp NPC anime (`Asuna`, `Yui`, `Maid`, `Zhongli`, `Mint`...), Boss (`Stormterror`, `Stone Golem`, `Monster`, `Dragon`) & cảnh/đạo cụ (`stadtmodell`, `mossy stairs`, `vines`).

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
