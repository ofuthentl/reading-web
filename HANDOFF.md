# HANDOFF
Cập nhật: 2026-11-21 01:21 | Nhánh: feat/bulk-shelf-grouping | Build: 🟢 frontend · 🟢 Worker (đã deploy live) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai `feat/bulk-shelf-grouping` — đã xong Phase 1, 2, 3 (`UploadBatchShelfBar`), chuẩn bị qua Phase 4 (`BulkShelfModal`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- **Phase 1 (Hoàn tất & đã deploy Worker live):** tách `workers/r2-storage/src/booksDb.ts`, thêm `POST /api/books/bulk-shelf` và đã deploy lên `https://arcane-library-api.novel-check-d467614e.workers.dev`.
- **Phase 2 (Hoàn tất):** mở rộng `extractSeriesName` và thêm `inferBatchCommonShelf` trong `src/lib/shelfPlacement.ts`.
- **Phase 3 (Hoàn tất):** tạo `src/components/UploadBatchShelfBar.tsx` và tích hợp vào footer `UploadDropzone.tsx` + `UploadQueueList.tsx` (tự động tick khi tìm thấy kệ chung, hỗ trợ sửa nhanh tên kệ kèm `<datalist>`, ép `shelfOverride` khi tải lên và tự reset khi `activeQueueItems.length === 0`).
- Chuẩn bị triển khai Phase 4 (`BulkShelfModal.tsx` + `Library2DView.tsx` + `App.tsx` + `api.ts`).

## Bước tiếp theo
1. Triển khai Phase 4: thêm `bulkUpdateBooksShelf` vào `src/lib/api.ts` (validate `shelf.length <= 120`), tạo `src/components/BulkShelfModal.tsx` (đối chiếu `existingShelves` + khoá `saving`), thêm nút `Chuyển kệ (N)` vào `Library2DView.tsx` và kết nối trong `App.tsx`.
2. Chạy toàn bộ kiểm định Mục 4 và báo người dùng kiểm thử thủ công trước khi mở PR vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 3 (`feat/bulk-shelf-grouping`):** thêm `UploadBatchShelfBar.tsx` vào footer `UploadDropzone.tsx` và đồng bộ preview kệ trong `UploadQueueList.tsx`.
- **Phase 2 (`feat/bulk-shelf-grouping`):** mở rộng `extractSeriesName` và thêm `inferBatchCommonShelf` trong `src/lib/shelfPlacement.ts`.
- **Phase 1 (`feat/bulk-shelf-grouping`):** tách `workers/r2-storage/src/booksDb.ts`, thêm `POST /api/books/bulk-shelf` và deploy Worker live.
