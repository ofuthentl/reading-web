# HANDOFF
Cập nhật: 2026-11-21 10:58 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 83.73 kB gzip, 0 B three) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (`Sub-phase 4A-T2` xong → chuẩn bị `Sub-phase 4A-T3`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Sub-phase 4A-T2 hoàn tất & kiểm định XANH 100%:**
  - Nén & kiểm định 3 model trong `glb/` (82.3 MiB → **1.89 MiB**) bằng WebP 1024 + Simplify + Quantize/Meshopt vào `public/models/` (`stone-golem.glb` 950 KB / 8.5k tris / 3 animations, `mountain-stairs.glb` 314 KB / 21k tris, `dragon-mascot.glb` 675 KB / 32k tris; `badUv = 0`, `badNormal = 0`).
  - Đo bbox & mặt cắt bậc thật của `mountain-stairs.glb` (`localZ +0.48 → -0.36`, `localY 0 → 0.415`, lệch tâm `X -0.065`) để căn khít `scaleVec [8.4, 5.783, 6.31]` & `posX +0.55` vào ramp `sakura-mountain-stairs` và `ruins-ancient-stairs` (`biomeBlueprints.ts`, giữ `floorWorldLayout3d.ts` 481 & `worldPhysics3d.ts` 461 `<= 500` dòng).
  - Xây dựng: `gltfLoader.ts` (local `MeshoptDecoder` từ `three`, 0 CDN), `worldPalettes.ts`, `worldMaterials.ts` (SkyDome + texture liền mạch Ngày/Chiều/Đêm), `worldGeometryBuilder.ts`, `WorldBiomeMesh.tsx`, `BiomePropsMesh.tsx` (kèm Stone Golem `Idle`, Dragon Mascot, Mountain Stairs, hạt không khí), cập nhật `geometryUtils.ts` & `InstancedBooksMesh.tsx` (`slot.pullDirection`, `cameraZ`, `activeFloorIndex`).
  - Kiểm thử tự động: 19/19 (4A-T1) + 5/5 (4A-T2) PASS, 0 CDN trong `src/` & `dist/`.
- `glb/` đã bỏ qua trong `.gitignore`; `library_sample/` và `image.png` giữ untracked local.

## Bước tiếp theo
1. **Sub-phase 4A-T3**: xây `KiritoAvatar.tsx` (rig khớp xương đa đoạn + texture anime Canvas2D + tà áo khoác & kiếm đeo lưng, hỗ trợ nạp tùy chọn `/models/player.glb`), `AmbientNpcs.tsx` (3–5 NPC đi dạo/ngồi đọc + thoại ngắn), `PlayerRig.tsx` (`WASD` + `Shift`, xoay chuột 360°, zoom, `V` Thứ 3 ↔ Thứ 1) và nối toàn bộ cảnh Biome mới vào `LibraryCanvas.tsx`.
2. **Sub-phase 4A-T4 → 4A-T5**: `MinimapWidget.tsx`, `CozyGameHud.tsx`, `ambientAudio.ts`, `InteractiveStations.tsx` → kiểm thử trình duyệt & mở PR 4A → `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A-T2 (`feat/library-3d`):** nén 3 GLB vào `public/models/` (WebP 1024 + Meshopt local), căn chuẩn bbox cầu thang với ramp, dựng 4 World Biomes + SkyDome + Props + `InstancedBooksMesh` xoay đa hướng.
- **Sub-phase 4A-T1 (`feat/library-3d`):** mô hình Thế giới 4 Biome + vật lý OBB/dốc/cầu/camera (`19/19` test PASS).
