# HANDOFF
Cập nhật: 2026-11-21 03:37 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 283.89 kB / 83.54 kB gzip, 0 B three) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Hoàn tất **Sub-phase 4A.2** (3 module lõi 3D thuần) — chờ người dùng duyệt để triển khai **Sub-phase 4A.3**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-3d.md

## Đang làm dở
- **Sub-phase 4A.2 xong & build xanh:** đã tạo 3 module lõi 3D thuần trong `src/components/library3d/` (0 CDN, 0 asset ngoài, mỗi file `<= 500` dòng hiệu dụng, chưa kéo `three` vào entry):
  - `layout3d.ts`: bố cục Đại sảnh tủ kệ gỗ cao 5 tầng (chia tầng gọn cho kệ 41+ cuốn như bộ SAO, tự mở rộng khoang tới 1.000 cuốn D-014), sách gáy đứng xen kẽ sách quay mặt bìa tiêu điểm, `getVisibleShelfWindow(cameraX, layouts, radius = 2)` và `selectFeaturedCoverSlots` (chốt cứng `<= 20–24` `CoverPlane` D-013).
  - `coverTextureCache.ts`: tái sử dụng `fetchCoverBlobCached`, LRU `MAX_COVER_TEXTURES = 36`, concurrency `MAX_CONCURRENT_COVER_LOADS = 4`, huỷ request khi kệ rời tầm nhìn, decode `createImageBitmap` `256×384` `flipY = false` + `SRGBColorSpace` (fallback thu hồi `URL.revokeObjectURL` ngay), giải phóng `texture.dispose()` + `bitmap.close()` khi evict & `disposeAll()`.
  - `proceduralMaterials.ts`: Canvas2D procedural 100% (`<= 4` VRAM textures: vân gỗ, bump gỗ, mặt giấy, atlas biển tên kệ font hệ thống) + bảng màu & đèn đồng bộ đủ 3 chế độ `light` / `dim` / `midnight`, đổi theme tại chỗ (`applyTheme`) và `dispose()`.
- Thư mục ảnh tham khảo local `library_sample/` vẫn giữ untracked (tuyệt đối không commit).

## Bước tiếp theo
1. Người dùng duyệt kết quả **Sub-phase 4A.2**.
2. Triển khai **Sub-phase 4A.3**: dựng cảnh WebGL `frameloop="demand"` (`LibraryRoomMesh.tsx` Đại sảnh cổ điển 2 tầng + phào đỉnh + biển tên atlas, `InstancedBooksMesh.tsx` 3 `InstancedMesh` + `<= 20–24` `CoverPlane`, `CameraRig.tsx`, `LibraryCanvas.tsx`, nối vào `FantasyLibrary3D.tsx`).
3. Triển khai **Sub-phase 4A.4** (HTML overlay `<= z-20`, `BookInspectCard`, kiểm định PR 4A).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A.2 (`feat/library-3d`):** tạo `layout3d.ts`, `coverTextureCache.ts`, `proceduralMaterials.ts`, chạy kiểm định runtime & build/lint/typecheck xanh 100%.
- **Fix ảnh bìa DOCX & Sub-phase 4A.1 (`feat/library-3d`):** xác nhận chạy ổn trên trình duyệt (51 cuốn · 4 kệ, chunk `FantasyLibrary3D` lazy 1.62 kB gzip, 0 byte `three`).
