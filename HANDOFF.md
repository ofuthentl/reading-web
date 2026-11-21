# HANDOFF
Cập nhật: 2026-11-21 10:22 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 83.74 kB gzip, 0 B three) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (`Sub-phase 4A-T1` → `4A-T5`) theo [phase-4-aincrad-tower.md](docs/plans/phase-4-aincrad-tower.md)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Đã chốt kế hoạch Aincrad Reading Tower (`PR 4A → 4B → 4C`)** & kiểm định 3 model trong `glb/` (đã thêm `glb/` vào `.gitignore`; giữ nguyên `library_sample/`, `image.png` untracked):
  - `Stone_Golem.glb` (9.51 MB, 8.5k tris, 20 xương, `Idle`/`Walk`/`Attack`, cao 3.04 m) → Boss Đài Cổng Tầng.
  - `pixellabs-stairs-3764.glb` (45.48 MB, 50k tris, 3× PNG 4K) → Bậc đá núi lên Đài Cổng (Tầng 2/4, scale ~5.5–6.5× + ramp vật lý).
  - `wings_of_freedom-child-3741.glb` (27.30 MB, 499k tris, tĩnh) → Tượng Linh vật / Trophy (cần simplify mạnh).
- **Chuyển ngay sang `Sub-phase 4A-T1`**: dựng `floorWorldLayout3d.ts`, `worldPhysics3d.ts`, giữ tương thích `layout3d.ts` và test tuyến đi bộ qua cả 4 biome.

## Bước tiếp theo
1. Hoàn tất **Sub-phase 4A-T1** (`floorWorldLayout3d.ts`, `worldPhysics3d.ts`, test tuyến đi bộ + typecheck/lint/build).
2. **Sub-phase 4A-T2**: nén GLB (`WebP 1024 + Simplify + Quantize/Meshopt` dùng `meshopt_decoder.module.js` local từ `three`, 0 CDN `gstatic.com`), kiểm tra mesh/UV đưa vào `public/models/`, dựng 4 World Biomes (`WorldBiomeMesh.tsx`, `BiomePropsMesh.tsx`, `proceduralMaterials.ts`, `InstancedBooksMesh.tsx`).
3. **Sub-phase 4A-T3 → 4A-T5**: `KiritoAvatar.tsx`, `AmbientNpcs.tsx`, `PlayerRig.tsx`, `CozyGameHud.tsx`, `MinimapWidget.tsx`, `ambientAudio.ts`, `InteractiveStations.tsx` → kiểm thử & mở PR 4A vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Chốt kiến trúc Aincrad Reading Tower (`feat/library-3d`):** cập nhật `docs/DECISIONS.md` (`D-010`, `D-013`, `D-015`, `D-016`, `D-017`), viết `docs/plans/phase-4-aincrad-tower.md`, phân tích kỹ thuật 3 model trong `glb/` và thêm `glb/` vào `.gitignore`.
- **Nền tảng 3D cũ (`Sub-phase 4A.1` → `4A.4`):** giữ nguyên lõi tái sử dụng (`useCanUse3D`, `useLibraryViewState`, `Library3DHost`, `coverTextureCache`, `geometryUtils`, `BookInspectCard`, `InstancedBooksMesh`).
