# HANDOFF
Cập nhật: 2026-11-25 18:05 | Nhánh: feat/v5-wave2-admin-storage-and-catalog | Build: 🟢 XANH (`index-*.js = 53.94 kB` gzip `<< 86.04 kB`, `npm test` 31/31)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 2 (`D-046` — `QĐ-4A`, `0` migration D1)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- **Wave 2 (Phase 2.1 → 2.4) ĐÃ HOÀN TẤT 100%, ĐÃ DEPLOY WORKER LÊN PRODUCTION & ĐÃ PUSH NHÁNH** (`typecheck`, `lint` 0/0 mọi tệp `<= 500` dòng, `npm test` 31/31 pass, `VITE_BASE_PATH=/ npm run build` đạt `53.94 kB` gzip, `npm run check:bundle`, Worker `tsc --noEmit`, kiểm thử E2E trình duyệt thật nối Worker local với `0` lỗi console/page).
- Sẵn sàng mở Pull Request từ `feat/v5-wave2-admin-storage-and-catalog` vào `main` để GitHub Actions CI kiểm tra và tự deploy Frontend lên `ofu.lol`.

## Xong trong nhánh này
### Phase 2.1 — Thay tệp EPUB/DOCX tại chỗ giữ tiến độ, bình luận & phân quyền (`QĐ-4A`)
- Worker (`bookReplaceRoute.ts`, `index.ts`): `PUT /api/books/:id/replace-file` (`requireOwner`) ghi key version mới giữ tệp cũ sống suốt lúc tải, kiểm tra nguyên tử `9.0 GiB` trừ `old_file_size`, cập nhật D1 giữ `books.id`, xoá tệp R2 & `guest-pack` cũ sau commit và rollback xoá key mới nếu D1 lỗi.
- Frontend (`bookReplaceClient.ts`, `apiAdminMutations.ts`, `BookReplaceFileSection.tsx`, `BookEditModal.tsx`, `AdminModalsHost.tsx`): `replaceBookFile()`, UI thay tệp kèm checkbox *"Cập nhật ảnh bìa từ tệp mới"* (mặc định tắt), tự dựng/tải lại `guest-pack`, xoá `file_key` cũ khỏi IndexedDB.

### Phase 2.2 — Đối soát dung lượng R2 thực tế & Dọn file rác mồ côi `> 24h`
- Worker (`storageReconcileRoute.ts`, `adminRoutes.ts`): `GET /api/admin/storage/reconcile` (phân trang `BOOKS_BUCKET.list()` tối đa 15 trang `< 50` subrequest, đối chiếu D1, gắn `safeToDelete: uploaded > 24h`) và `POST /api/admin/storage/reconcile/cleanup` (chỉ xoá tệp mồ côi thật `> 24h`).
- Frontend (`storageReconcileApi.ts`, `AdminR2ReconcileCard.tsx`, `AdminStorageSecurityPanel.tsx`, `AdminUsageView.tsx`, `App.tsx`): thẻ nạp lười *"Đối soát kho R2 thực tế"* trên `/usage`.

### Phase 2.3 — Nâng cấp *Sức khoẻ kho sách* & Đồng bộ gói khách chọn lọc
- `AdminLibraryHealthModal.tsx`, `ShelfBatchNoteModal.tsx`, `AdminModalsHost.tsx`, `AuthenticatedLibraryShell.tsx`: bỏ `.slice(0, 20/30)`, thêm phân trang *"Xem thêm"* / *"Hiện tất cả"* và nút mở thẳng sửa tập / *Gợi ý AniList* bộ / đồng bộ tập.
- `guestPackBatchSync.ts`, `AdminProtectionSyncTab.tsx`, `AdminProtectionModal.tsx`: lọc & đồng bộ chọn lọc theo bộ/tập với `concurrency = 2` (`<= 40 MB`, `1` nếu `> 40 MB`), sửa bug bấm *Dừng* vẫn cập nhật đúng sách đã xong & `storage`.

### Phase 2.4 — Sao lưu / Khôi phục JSON Owner & Tối ưu `GET /api/books` bằng ETag (`304`)
- Worker (`backupSchema.ts`, `backupExport.ts`, `backupRoute.ts`, `adminRoutes.ts`): `GET /api/admin/backup/export` & `POST /api/admin/backup/import` (`requireOwner`, validate chặt schema v1, `0 B` R2, `merge`/`replace`, bỏ qua sách đã xoá tránh FK). Frontend (`backupApi.ts`, `AdminBackupCard.tsx`) nạp lười trên `/usage`.
- Worker + Frontend (`booksEtag.ts`, `index.ts`, `libraryStateCache.ts`, `api.ts`, `authSession.ts`): `GET /api/books` sinh Weak ETag `W/"v1-<role>-<32hex>"` + `If-None-Match` → `304 Not Modified`; client cache RAM/`sessionStorage` theo phiên.
- Unit Tests (`tests/wave2AdminAndEtag.test.ts`, `scripts/run-tests.mjs`): bổ sung 6 test Wave 2 (tổng 31/31 pass), giữ tên job CI `Frontend (typecheck, lint, build)` khớp Required check của `main` (vẫn chạy đủ `typecheck`, `lint`, `test`, `build`, `check:bundle`) + cập nhật `docs/ARCHITECTURE.md`, `docs/plans/v5-bugfixes-and-upgrades.md`.

## Bước tiếp theo
1. Mở & merge Pull Request Wave 2 (`feat/v5-wave2-admin-storage-and-catalog` → `main`) sau khi CI xanh để auto-deploy Frontend lên `ofu.lol`.
2. Sau khi Wave 2 merge vào `main`, tách nhánh mới `feat/v5-wave3-reader-ux-security-discord` cho **Wave 3** (1 migration cộng thêm `0019`).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
