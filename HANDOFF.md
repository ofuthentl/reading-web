# HANDOFF
Cập nhật: 2026-11-25 17:28 | Nhánh: feat/v5-wave2-admin-storage-and-catalog | Build: 🟡 Đang kiểm tra Phase 2.2
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 2 (`D-046` — `QĐ-4A`, `0` migration D1)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Triển khai tuần tự 4 Phase của Wave 2 trên nhánh `feat/v5-wave2-admin-storage-and-catalog` (tách sạch từ `origin/main` sau PR #36 Wave 1).
- Đã hoàn tất mã nguồn Phase 2.1 & Phase 2.2; chuẩn bị triển khai Phase 2.3 & Phase 2.4, unit test, build và kiểm thử trình duyệt.

## Xong trong nhánh này
### Phase 2.1 — Thay tệp EPUB/DOCX tại chỗ giữ tiến độ, bình luận & phân quyền (`QĐ-4A`)
- Worker (`bookReplaceRoute.ts`, `index.ts`): `PUT /api/books/:id/replace-file` (`requireOwner`) ghi key version mới giữ nguyên tệp cũ lúc tải, kiểm tra nguyên tử `9.0 GiB` trừ `old_file_size`, cập nhật D1 giữ `books.id`, xoá R2 & `guest-pack` cũ sau commit, rollback xoá key mới nếu D1 lỗi.
- Frontend (`bookReplaceClient.ts`, `apiAdminMutations.ts`, `BookReplaceFileSection.tsx`, `BookEditModal.tsx`, `AdminModalsHost.tsx`): `replaceBookFile()`, UI thay tệp kèm tuỳ chọn *"Cập nhật ảnh bìa từ tệp mới"* (mặc định TẮT), dựng & tải lại `guest-pack`, xoá `file_key` cũ ở IndexedDB.

### Phase 2.2 — Đối soát dung lượng R2 thực tế & Dọn file rác mồ côi (`> 24h`)
- Worker (`storageReconcileRoute.ts`, `adminRoutes.ts`): `GET /api/admin/storage/reconcile` (phân trang `BOOKS_BUCKET.list()` tối đa `15` trang/lượt tôn trọng `< 50` subrequest, đối chiếu `books.file_key`, `books.cover_key`, `book_guest_packs.pack_key`, gắn cờ `safeToDelete: uploaded > 24h`) và `POST /api/admin/storage/reconcile/cleanup` (đối chiếu lại trực tiếp D1 & tuổi thật `> 24h` trước khi xoá batch).
- Frontend (`storageReconcileApi.ts`, `AdminR2ReconcileCard.tsx`, `AdminStorageSecurityPanel.tsx`, `AdminUsageView.tsx`, `App.tsx`): thẻ nạp lười *"Đối soát kho R2 thực tế"* trên `/usage` có chọn lọc, bảo vệ tệp `<= 24h` và xác nhận 2 bước.

## Bước tiếp theo
1. Phase 2.3: Nâng cấp *Sức khoẻ kho sách* (bỏ `.slice(0, 20/30)`, thêm phân trang/"Xem thêm" + mở thẳng sửa metadata/AniList) & Đồng bộ `guest-pack` chọn lọc theo Bộ/Tập (`concurrency = 2` <= 40 MB) + sửa bug bấm Dừng.
2. Phase 2.4: Sao lưu/Khôi phục JSON Owner (`GET/POST /api/admin/backup/*`) & ETag `304` cho `GET /api/books`.
3. Viết unit tests, chạy full verification, kiểm thử trình duyệt thật & hỏi người dùng trước khi deploy Worker / push.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
