# HANDOFF
Cập nhật: 2026-11-25 17:38 | Nhánh: feat/v5-wave2-admin-storage-and-catalog | Build: 🟡 Đang kiểm tra Phase 2.3
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 2 (`D-046` — `QĐ-4A`, `0` migration D1)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Triển khai tuần tự 4 Phase của Wave 2 trên nhánh `feat/v5-wave2-admin-storage-and-catalog` (tách sạch từ `origin/main` sau PR #36 Wave 1).
- Đã hoàn tất mã nguồn Phase 2.1, 2.2 & 2.3; chuẩn bị triển khai Phase 2.4 (Sao lưu JSON Owner + ETag `304`), unit test, build và kiểm thử trình duyệt.

## Xong trong nhánh này
### Phase 2.1 — Thay tệp EPUB/DOCX tại chỗ giữ tiến độ, bình luận & phân quyền (`QĐ-4A`)
- Worker `PUT /api/books/:id/replace-file` (`bookReplaceRoute.ts`, `index.ts`) + Frontend `replaceBookFile()` (`bookReplaceClient.ts`, `BookReplaceFileSection.tsx`, `BookEditModal.tsx`, `AdminModalsHost.tsx`).

### Phase 2.2 — Đối soát dung lượng R2 thực tế & Dọn file rác mồ côi (`> 24h`)
- Worker `GET /api/admin/storage/reconcile` & `POST /api/admin/storage/reconcile/cleanup` (`storageReconcileRoute.ts`, `adminRoutes.ts`) + Frontend `storageReconcileApi.ts`, `AdminR2ReconcileCard.tsx` nạp lười trên `/usage`.

### Phase 2.3 — Nâng cấp *Sức khoẻ kho sách* & Đồng bộ gói khách chọn lọc
- `AdminLibraryHealthModal.tsx`, `AdminModalsHost.tsx`, `ShelfBatchNoteModal.tsx`, `AuthenticatedLibraryShell.tsx`: bỏ cắt cụt `.slice(0, 20/30)`, bổ sung phân trang *"Xem thêm"* / *"Hiện tất cả"* cho đủ 100% mục và nút mở thẳng sửa tập, *Gợi ý AniList* cả bộ hoặc đồng bộ từng cuốn.
- `guestPackBatchSync.ts`, `AdminProtectionSyncTab.tsx`, `AdminProtectionModal.tsx`: thêm lọc theo bộ truyện/từng cuốn/trạng thái gói, đồng bộ chọn lọc thích ứng `concurrency = 2` (`<= 40 MB`, `1` nếu `> 40 MB`), và sửa bug bấm *Dừng* vẫn cập nhật đúng các cuốn đã đồng bộ thành công & kéo lại `storage` chuẩn về store.

## Bước tiếp theo
1. Phase 2.4: Sao lưu/Khôi phục JSON Owner (`GET/POST /api/admin/backup/*`) & ETag `304` cho `GET /api/books` (Worker + client `sessionStorage`/RAM cache).
2. Viết unit tests (`tests/`), chạy full `typecheck`, `lint`, `build`, `check:bundle`, `npm test`, Worker `tsc --noEmit`.
3. Cập nhật `docs/ARCHITECTURE.md` & `HANDOFF.md`, kiểm thử trình duyệt thật theo Checklist Wave 2, rồi hỏi người dùng trước khi deploy Worker / push.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
