# HANDOFF
Cập nhật: 2026-11-21 03:56 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 83.60 kB gzip, 0 B three · chunk 3D lazy 237.50 kB gzip) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Hoàn tất **Sub-phase 4A.3** (cảnh WebGL `frameloop="demand"`) — sẵn sàng cho người dùng test trình duyệt và duyệt sang **Sub-phase 4A.4**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-3d.md

## Đang làm dở
- **Sub-phase 4A.3 xong & build xanh:**
  - `LibraryRoomMesh.tsx`: Đại sảnh cổ điển 2 tầng 100% procedural (tủ kệ gỗ 5 tầng phào đỉnh, tầng lửng lan can, cột cổ điển không chắn tầm nhìn kệ, cửa sổ phát sáng, đèn chùm cầu đồng, atlas biển tên kệ gom 1 mesh) = **10 draw calls cố định** + ánh sáng 3 theme `light`/`dim`/`midnight` (0 CDN).
  - `InstancedBooksMesh.tsx`: **3 `InstancedMesh` cố định** (bìa vải, khối trang giấy, 4 gân nhũ gáy sách gộp 1 geometry, động tới `2.000` cuốn) + tối đa **`<= 20–24` `CoverPlane` tiêu điểm** (D-013), hover/click/chọn nhiều, rút sách dừng tại `< 1e-3`.
  - `CameraRig.tsx`: kéo chuột (tách bạch drag/click), lăn chuột/trackpad, phím `←`/`→`/`A`/`D`/`Home`/`End`, nhảy nhanh tới kệ, tự dừng ở `< 1e-3` (0 FPS khi đứng yên), đồng bộ đèn chùm.
  - `LibraryCanvas.tsx` & `FantasyLibrary3D.tsx`: `<Canvas frameloop="demand">`, xử lý `webglcontextlost`/`restored` + `visibilitychange` + `paused` (nối `openingBook` ở `App.tsx`), thu hồi sạch GPU/LRU `disposeAll()` khi unmount, thanh nhảy kệ & preview sách tạm (`<= z-20`).
- Thư mục ảnh tham khảo local `library_sample/` vẫn giữ untracked (không commit).

## Bước tiếp theo
1. Người dùng chạy thử trên trình duyệt (`npm run dev` hoặc `npm run preview`): kiểm tra cảnh 3D Đại sảnh, kéo/cuộn/phím, đổi 3 theme `light`/`dim`/`midnight`, hover/chọn/mở sách, và xem DevTools Frame Rendering Stats = 0 FPS khi đứng yên.
2. Sau khi duyệt, triển khai **Sub-phase 4A.4**: hoàn thiện HTML overlay đầy đủ (`Library3DOverlay.tsx` tìm kiếm không dấu, lọc kệ, thanh chọn nhiều, dải "Tiếp tục đọc", `BookInspectCard.tsx`, nối đủ 5 modal `z-40`) và kiểm định toàn diện PR 4A.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A.3 (`feat/library-3d`):** dựng xong cảnh WebGL procedural 3 theme, 3 `InstancedMesh` + `<= 20–24` `CoverPlane`, `CameraRig`, `LibraryCanvas`, nối vào `FantasyLibrary3D` (entry `83.60 kB <= 86.04 kB`, lazy 3D `237.50 kB <= 240 kB`, 0 byte `three` trong entry, 0 CDN).
- **Sub-phase 4A.2 (`feat/library-3d`):** tạo 3 module lõi `layout3d.ts`, `coverTextureCache.ts`, `proceduralMaterials.ts`.
