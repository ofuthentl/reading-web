# HANDOFF
Cập nhật: 2026-11-21 03:00 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 283.19 kB / 83.18 kB gzip) · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Đã hoàn tất **Sub-phase 4A.1** (ranh giới D-008 + state dùng chung + `ViewModeToggle` + `Library3DHost` lazy) — dừng chờ người dùng test nhanh trước khi sang **Sub-phase 4A.2**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-3d.md

## Đang làm dở
- **Sub-phase 4A.1 xong & build xanh:** `useCanUse3D.ts`, `useLibraryViewState.ts`, `ViewModeToggle.tsx`, `Library3DHost.tsx`, vỏ tạm `FantasyLibrary3D.tsx` (`4.19 kB / 1.62 kB gzip`, chưa kéo `three`), nối `LibraryHeader.tsx`, `Library2DView.tsx`, `App.tsx`.
- Đã ghi nhận thư mục ảnh tham khảo local `library_sample/` (untracked, không commit) để làm cảm hứng thị giác khi triển khai Sub-phase 4A.2–4A.3.

## Bước tiếp theo
1. Người dùng test nhanh Sub-phase 4A.1 trên trình duyệt (`npm run build && npm run preview -- --port 5173 --strictPort`).
2. Sau khi xác nhận: triển khai **Sub-phase 4A.2** (`layout3d.ts`, `coverTextureCache.ts` với `createImageBitmap` + LRU 36 + concurrency 4, `proceduralMaterials.ts` tham khảo tone/vật liệu từ `library_sample/`, 0 CDN).
3. Tiếp tục **Sub-phase 4A.3** (cảnh WebGL `frameloop="demand"`, 3 `InstancedMesh`, chốt `CoverPlane <= 20–24`) và **Sub-phase 4A.4** (HTML overlay `<= z-20`, `BookInspectCard`, kiểm định PR 4A).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A.1 (`feat/library-3d`):** triển khai đủ guard D-008, state dùng chung 2D/3D, công tắc `2D`/`3D`, vỏ lazy `Library3DHost` + `ErrorBoundary` fallback tức thì về 2D; `index-*.js` = `283.19 kB / 83.18 kB gzip` (dưới trần `86.04 kB gzip`), 0 lỗi/0 cảnh báo.
- **Chốt `D-010` → `D-014` & đồng bộ `docs/plans/phase-4-3d.md`:** cập nhật sau khi PR #4 (`D-009`) merge vào `origin/main`.
