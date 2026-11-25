# HANDOFF
Cập nhật: 2026-11-25 17:20 | Nhánh: feat/v5-wave2-admin-storage-and-catalog | Build: 🟡 Đang kiểm tra Phase 2.1
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 2 (`D-046` — `QĐ-4A`, `0` migration D1)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Triển khai tuần tự 4 Phase của Wave 2 trên nhánh `feat/v5-wave2-admin-storage-and-catalog` (tách sạch từ `origin/main` sau PR #36 Wave 1).
- Đã hoàn tất mã nguồn Phase 2.1 (Thay tệp EPUB/DOCX tại chỗ); chuẩn bị triển khai Phase 2.2 → 2.4, unit test, build & kiểm thử trình duyệt.

## Xong trong nhánh này
### Phase 2.1 — Thay tệp EPUB/DOCX tại chỗ giữ tiến độ, bình luận & phân quyền (`QĐ-4A`)
- Worker (`workers/r2-storage/src/bookReplaceRoute.ts`, `index.ts`): thêm `PUT /api/books/:id/replace-file` (`requireOwner`) ghi sang key mới `books/<id>-<ts>-<rand>.<ext>` giữ nguyên tệp cũ lúc tải, kiểm tra nguyên tử hạn mức `9.0 GiB` có trừ `old_file_size`, cập nhật D1 giữ nguyên `books.id` (bảo toàn tiến độ Owner/Guest, bookmarks, highlights, ratings, comments, phân quyền 3 tầng, bìa kệ), chỉ xoá tệp R2 & `guest-pack` cũ sau khi commit thành công và rollback xoá key mới nếu D1 lỗi.
- Frontend (`src/lib/bookReplaceClient.ts`, `apiAdminMutations.ts`, `BookReplaceFileSection.tsx`, `BookEditModal.tsx`, `AdminModalsHost.tsx`): thêm `replaceBookFile()` + khu vực *"Thay tệp sách (giữ nguyên tiến độ, bình luận & phân quyền)"* kèm tuỳ chọn *"Cập nhật ảnh bìa từ tệp mới"* (mặc định TẮT), tự dựng & tải lại `guest-pack`, xoá `file_key` cũ khỏi IndexedDB và cập nhật live state + `storage`.

## Bước tiếp theo
1. Phase 2.2: Đối soát dung lượng R2 thực tế & Dọn file rác mồ côi `> 24h` (`GET /api/admin/storage/reconcile`, `POST /api/admin/storage/reconcile/cleanup`, thẻ UI nạp lười trong `/usage`).
2. Phase 2.3: Nâng cấp *Sức khoẻ kho sách* (bỏ `.slice(0, 20/30)`, thêm phân trang/"Xem thêm" + mở thẳng sửa metadata/AniList) & Đồng bộ `guest-pack` chọn lọc theo Bộ/Tập (`concurrency = 2` <= 40 MB) + sửa bug bấm Dừng.
3. Phase 2.4: Sao lưu/Khôi phục JSON Owner (`GET/POST /api/admin/backup/*`) & ETag `304` cho `GET /api/books`.
4. Viết unit tests, chạy full verification, kiểm thử trình duyệt thật & hỏi người dùng trước khi deploy Worker / push.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
