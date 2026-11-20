# HANDOFF
Cập nhật: 2026-11-21 03:17 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 283.89 kB / 83.54 kB gzip) · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Đã hoàn tất **Sub-phase 4A.1** và vá lỗi trích xuất ảnh bìa `.docx` (`extractDocxCover`) — sẵn sàng sang **Sub-phase 4A.2**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-3d.md

## Đang làm dở
- **Sub-phase 4A.1 xong & build xanh:** `useCanUse3D.ts`, `useLibraryViewState.ts`, `ViewModeToggle.tsx`, `Library3DHost.tsx`, vỏ tạm `FantasyLibrary3D.tsx` (`4.19 kB / 1.62 kB gzip`, chưa kéo `three`), nối `LibraryHeader.tsx`, `Library2DView.tsx`, `App.tsx`.
- **Đã vá lỗi ảnh bìa `.docx`:** đổi thứ tự ứng viên bìa sang `word/document.xml` → `word/media/*` → `docProps/thumbnail.*`, thêm `rejectBlankOrTiny` trong `compressCoverBlob` để loại bỏ ảnh thumbnail trắng trơn/icon quá nhỏ, và đã cập nhật luôn ảnh bìa thật (`word/media/image1.jpg`) trên R2/D1 cho 2 tập `.docx` đã tải lên.
- Đã ghi nhận thư mục ảnh tham khảo local `library_sample/` (untracked, không commit) để làm cảm hứng thị giác khi triển khai Sub-phase 4A.2–4A.3.

## Bước tiếp theo
1. Người dùng tải lại trang (`F5` / nút Làm mới) để xác nhận 2 cuốn `.docx` đã hiển thị ảnh bìa thật và test nhanh Sub-phase 4A.1.
2. Triển khai **Sub-phase 4A.2** (`layout3d.ts`, `coverTextureCache.ts` với `createImageBitmap` + LRU 36 + concurrency 4, `proceduralMaterials.ts` tham khảo tone/vật liệu từ `library_sample/`, 0 CDN).
3. Tiếp tục **Sub-phase 4A.3** (cảnh WebGL `frameloop="demand"`, 3 `InstancedMesh`, chốt `CoverPlane <= 20–24`) và **Sub-phase 4A.4** (HTML overlay `<= z-20`, `BookInspectCard`, kiểm định PR 4A).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Fix ảnh bìa DOCX (`coverImage.ts`, `docxXml.ts`, `docxParser.ts`):** ưu tiên ảnh theo thứ tự xuất hiện trong `word/document.xml`, lọc bỏ ảnh `docProps/thumbnail.jpeg` trắng trơn và khôi phục bìa thật trên R2/D1 cho 2 cuốn `.docx`.
- **Sub-phase 4A.1 (`feat/library-3d`):** triển khai đủ guard D-008, state dùng chung 2D/3D, công tắc `2D`/`3D`, vỏ lazy `Library3DHost` + `ErrorBoundary` fallback tức thì về 2D.
