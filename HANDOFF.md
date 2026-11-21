# HANDOFF
Cập nhật: 2026-11-21 10:38 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 83.73 kB gzip, 0 B three) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (`Sub-phase 4A-T1` xong → chuẩn bị `Sub-phase 4A-T2`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Sub-phase 4A-T1 hoàn tất & kiểm định XANH 100%:**
  - `bookPacking3d.ts` (388 dòng): tách lõi xếp sách vào tủ + chuyển ma trận xoay Euler `'XYZ'` chuẩn xác cho tủ kệ xoay mọi góc `facingYaw`, `CoverPlaneTransform` và vector `pullDirection`.
  - `layout3d.ts` (311 dòng): giữ 100% export tương thích ngược, bổ sung windowing 2D `(x, z)` + lọc `activeFloorIndex`.
  - `worldTypes.ts` (241 dòng) + `biomeBlueprints.ts` (433 dòng): thiết kế 4 World Biome (`town_of_beginnings`, `sakura_shrine`, `starfield_atrium`, `starlight_ruins`) với 6 neo tủ kệ/tầng, cầu gỗ vồng, bậc đá núi, collider nước/vách đá/cột, trạm tương tác, NPC & `bossAnchor`.
  - `floorWorldLayout3d.ts` (480 dòng) + `worldPhysics3d.ts` (461 dòng): phân bổ kệ & tự tách kệ dài sang nhiều tủ 2 khoang, collider OBB động, `resolveSurfaceY`, `resolveWorldPlayerStep` (chia nhỏ chống xuyên tường, chắn nước/vực), `resolveCameraOrbitPosition` (raycast chống xuyên tường/kệ).
  - Kiểm thử tự động 19/19 PASS (0–1.000 cuốn, đi bộ liên tục cả 4 biome đi/về & sát mép cầu/bậc đá, OBB wall-slide, NPC loop, camera anti-clipping).
- Thư mục `glb/` đã thêm vào `.gitignore`; `library_sample/` và `image.png` vẫn giữ untracked local.

## Bước tiếp theo
1. **Sub-phase 4A-T2**:
   - Nén 3 model trong `glb/` bằng **WebP 1024 + Simplify + Quantize/Meshopt local** (`meshopt_decoder.module.js` từ `three`, tuyệt đối không gọi CDN `gstatic.com`), kiểm tra lại mesh/UV trước khi đưa vào `public/models/`.
   - Dựng 4 World Biomes (`WorldBiomeMesh.tsx`, `BiomePropsMesh.tsx`, mở rộng `proceduralMaterials.ts` có SkyDome Ngày/Chiều/Đêm, cập nhật `InstancedBooksMesh.tsx` theo `activeFloorIndex` & `pullDirection`).
2. **Sub-phase 4A-T3 → 4A-T5**: `KiritoAvatar.tsx`, `AmbientNpcs.tsx`, `PlayerRig.tsx`, `CozyGameHud.tsx`, `MinimapWidget.tsx`, `ambientAudio.ts`, `InteractiveStations.tsx` → kiểm thử & PR 4A → `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A-T1 (`feat/library-3d`):** hoàn thiện kiến trúc thế giới 4 biome + vật lý OBB/dốc/cầu/camera (`bookPacking3d.ts`, `layout3d.ts`, `worldTypes.ts`, `biomeBlueprints.ts`, `floorWorldLayout3d.ts`, `worldPhysics3d.ts`), 19/19 test PASS, `typecheck`/`lint`/`build` XANH.
- **Chốt kế hoạch Aincrad Reading Tower (`feat/library-3d`):** commit `DECISIONS.md`, `phase-4-aincrad-tower.md`, `HANDOFF.md` và thêm `glb/` vào `.gitignore`.
