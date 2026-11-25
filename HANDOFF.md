# HANDOFF
Cập nhật: 2026-11-25 17:48 | Nhánh: feat/v5-wave2-admin-storage-and-catalog | Build: 🟡 Đang kiểm tra Phase 2.4
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 2 (`D-046` — `QĐ-4A`, `0` migration D1)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Đã hoàn tất mã nguồn cả 4 Phase Wave 2 (`2.1 → 2.4`); tiếp theo kiểm tra typecheck/lint, bổ sung unit tests, chạy full build/bundle check, cập nhật `docs/ARCHITECTURE.md` & kiểm thử trình duyệt thật.

## Xong trong nhánh này
### Phase 2.1 — Thay tệp EPUB/DOCX tại chỗ (`QĐ-4A`)
- Worker `PUT /api/books/:id/replace-file` (`bookReplaceRoute.ts`, `index.ts`) + Frontend `replaceBookFile()` (`bookReplaceClient.ts`, `BookReplaceFileSection.tsx`, `BookEditModal.tsx`, `AdminModalsHost.tsx`).

### Phase 2.2 — Đối soát dung lượng R2 thực tế & Dọn rác mồ côi `> 24h`
- Worker `GET /api/admin/storage/reconcile` & `POST /api/admin/storage/reconcile/cleanup` (`storageReconcileRoute.ts`, `adminRoutes.ts`) + Frontend `storageReconcileApi.ts`, `AdminR2ReconcileCard.tsx` nạp lười trên `/usage`.

### Phase 2.3 — Nâng cấp *Sức khoẻ kho sách* & Đồng bộ gói khách chọn lọc
- `AdminLibraryHealthModal.tsx` (bỏ cắt cụt `.slice(0, 20/30)`, thêm phân trang *"Xem thêm"* / *"Hiện tất cả"*, mở thẳng sửa tập / AniList bộ / đồng bộ tập); `guestPackBatchSync.ts`, `AdminProtectionSyncTab.tsx`, `AdminProtectionModal.tsx` (lọc theo bộ/tập, `concurrency = 2` `<= 40 MB`, sửa bug bấm Dừng vẫn cập nhật store & `storage`).

### Phase 2.4 — Sao lưu / Khôi phục JSON Owner & ETag `304` cho `GET /api/books`
- Worker (`backupSchema.ts`, `backupRoute.ts`, `adminRoutes.ts`): `GET /api/admin/backup/export` & `POST /api/admin/backup/import` (`requireOwner`, validate chặt schema v1, `0 B` R2, hỗ trợ `merge`/`replace`, tự bỏ qua sách đã xoá tránh lỗi FK). Frontend (`backupApi.ts`, `AdminBackupCard.tsx`) nạp lười trên `/usage`.
- Worker + Frontend (`booksEtag.ts`, `index.ts`, `libraryStateCache.ts`, `api.ts`, `authSession.ts`): `GET /api/books` sinh Weak ETag `W/"v1-<role>-<32hex>"`, hỗ trợ `If-None-Match` → `304 Not Modified` (rỗng body), client nhớ bản nhẹ trong RAM/`sessionStorage` (không lưu blob vào `localStorage`, xoá sạch khi đổi token/đăng xuất).

## Bước tiếp theo
1. Viết unit tests Wave 2 (`tests/wave2AdminAndEtag.test.ts`), chạy sạch `typecheck`, `lint`, `build` (`index-*.js <= 86.04 kB`), `check:bundle`, `npm test`, Worker `tsc --noEmit`.
2. Cập nhật `docs/ARCHITECTURE.md` & `HANDOFF.md`, kiểm thử trình duyệt thật theo Checklist Wave 2, rồi hỏi xác nhận người dùng trước khi deploy Worker & `git push`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
