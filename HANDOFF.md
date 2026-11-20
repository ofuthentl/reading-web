# HANDOFF
Cập nhật: 2026-11-21 01:18 | Nhánh: feat/bulk-shelf-grouping | Build: 🟢 frontend · 🟢 Worker (đã deploy live) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai `feat/bulk-shelf-grouping` — đã xong Phase 1 & Phase 2 (`shelfPlacement.ts`), chuẩn bị qua Phase 3
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- **Phase 1 (Hoàn tất & đã deploy Worker live):** tách `workers/r2-storage/src/booksDb.ts`, thêm `POST /api/books/bulk-shelf` và đã `wrangler deploy` lên `https://arcane-library-api.novel-check-d467614e.workers.dev` (Version ID: `7ebbf047-6119-4281-b257-43ebe51e7c92`).
- **Phase 2 (Hoàn tất):** mở rộng `extractSeriesName` (`SAO1`, `SAOP1`, `SAO (01)`, `SAO [01]`, `SAO v01`, `SAO vol.1`, `Tên - 01`) và thêm `inferBatchCommonShelf` (chỉ rút gọn mã viết tắt như `SAOP` → `SAO` khi khớp gốc/kệ đã tồn tại trong lô hoặc `existingBooks`, chống gom nhầm `REMAKE1` + `REMAIN1` hoặc từ mở đầu vô nghĩa).
- Chuẩn bị triển khai Phase 3 (`UploadBatchShelfBar.tsx` + `UploadDropzone.tsx`) và Phase 4 (`BulkShelfModal.tsx` + `Library2DView.tsx` + `App.tsx` + `api.ts`).

## Bước tiếp theo
1. Triển khai Phase 3: tạo `src/components/UploadBatchShelfBar.tsx` và tích hợp vào footer `UploadDropzone.tsx` + `UploadQueueList.tsx`.
2. Triển khai Phase 4: tạo `src/components/BulkShelfModal.tsx`, thêm `bulkUpdateBooksShelf` vào `src/lib/api.ts`, tích hợp nút `Chuyển kệ (N)` vào `Library2DView.tsx` và `App.tsx`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 2 (`feat/bulk-shelf-grouping`):** mở rộng `extractSeriesName` và thêm `inferBatchCommonShelf` trong `src/lib/shelfPlacement.ts`.
- **Phase 1 (`feat/bulk-shelf-grouping`):** tách `workers/r2-storage/src/booksDb.ts`, thêm `POST /api/books/bulk-shelf` và deploy Worker live.
