# HANDOFF
Cập nhật: 2026-11-21 01:08 | Nhánh: feat/bulk-shelf-grouping | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Lập kế hoạch tự động gom kệ theo lô & chuyển kệ hàng loạt (`docs/plans/bulk-shelf-grouping.md`) — chờ người dùng duyệt
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Đã xác nhận `refactor/code-splitting` được merge vào `origin/main` (PR #2) và tách nhánh mới `feat/bulk-shelf-grouping` từ `origin/main`.
- Đã viết kế hoạch chi tiết 4 phase vào `docs/plans/bulk-shelf-grouping.md` (chưa sửa code ứng dụng), bao gồm:
  1. **Phase 1 (Worker):** tách `workers/r2-storage/src/booksDb.ts` để giữ mọi file Worker < 380 dòng, thêm `POST /api/books/bulk-shelf` (chia lô ≤ 50 ID trong `env.DB.batch`) và deploy Worker live.
  2. **Phase 2 (`shelfPlacement.ts`):** mở rộng `extractSeriesName` (`SAO1`, `SAOP1`, `SAO (01)`, `SAO v01`...) và thêm `inferBatchCommonShelf` (tìm gốc chung đa số ≥ 50% & ≥ 2 tệp, chống gom nhầm từ mở đầu vô nghĩa).
  3. **Phase 3 (`UploadBatchShelfBar.tsx` + `UploadDropzone.tsx`):** pill checkbox `Thêm vào kệ <Tên>` ở góc trái footer modal tải sách (cho phép sửa nhanh tên kệ kèm `<datalist>` và ép `shelfOverride` cho cả lô).
  4. **Phase 4 (`BulkShelfModal.tsx` + `Library2DView.tsx` + `App.tsx` + `api.ts`):** thêm `bulkUpdateBooksShelf`, nút `Chuyển kệ (N)` trong thanh chọn nhiều để gom nhanh 41 cuốn SAO trên `ofu.lol` chỉ bằng 1 thao tác.

## Bước tiếp theo
1. Chờ người dùng duyệt kế hoạch `docs/plans/bulk-shelf-grouping.md`.
2. Sau khi được duyệt: triển khai lần lượt Phase 1 → Phase 4 (mỗi phase 1 commit nhỏ kèm cập nhật `HANDOFF.md` & `docs/ARCHITECTURE.md`), deploy Worker live ở Phase 1 và chạy đủ Checklist kiểm thử Mục 4.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Merge PR #2 (`refactor/code-splitting` → `main`):** hoàn tất tách `parsers.ts`, lazy-load `PdfReader` + 3 engine đọc sách, vá XSS bằng `DOMPurify` v3, giảm entry bundle từ 918.12 kB xuống 259.77 kB.
- **Xác nhận hậu kỳ Phase 3:** `https://ofu.lol` đã chạy ổn định trên PC & mobile; đã dọn sạch project Supabase cũ và secret `VITE_SUPABASE_*` theo D-001.
