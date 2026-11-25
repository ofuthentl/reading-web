# HANDOFF
Cập nhật: 2026-11-25 18:29 | Nhánh: feat/v5-wave3-reader-ux-security-discord | Build: 🟢 XANH (`typecheck`, `lint`, Worker `tsc`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 3 (`D-046` — `QĐ-5A`, migration `0019`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Hoàn tất Migration `0019`, Phase 3.1 (Speculative Prefetch khách Discord) và Phase 3.2 (Thanh tua nhanh, Bảng phím tắt `?`, `<ModalShell>` thống nhất, `prefers-reduced-motion`, nạp dần Trang chủ).
- Tiếp theo: triển khai Phase 3.3 (Security Headers Worker, CSP Frontend, *Đăng xuất mọi thiết bị Admin* `owner_min_iat`).

## Xong trong nhánh này
### Migration D1 `0019_v5_security_and_presets.sql` (`QĐ-5A`)
- Tạo `0019_v5_security_and_presets.sql` + đồng bộ `schema.sql` (`app_security_state`, `discord_access_presets`, `discord_access_preset_members`, backfill `rl_last_strike_at`, xoá 2 index dư thừa ở migration & runtime).

### Phase 3.1 — Tải trước chương kế tiếp cho Khách Discord (Speculative Prefetch)
- `src/lib/guestCrypto.ts`, `src/hooks/useGuestChapterStream.ts`, `src/components/GuestCanvasReader.tsx`: guard thuần `shouldPrefetchNextGuestChapter` (ngưỡng `>= 78%` cuộn dọc & lật trang, bỏ qua chương khoá `D-042` và cooldown `429`), tải ngầm đúng 1 chương kế bằng `AbortController` riêng seed `chapterCacheRef` (huỷ ngay khi đổi chương/đóng sách).

### Phase 3.2 — Thanh tua nhanh, Phím tắt `?`, `<ModalShell>` thống nhất & Nạp dần Trang chủ
- `ReaderQuickScrubberPopover.tsx`, `ReaderFooterStatusBar.tsx`, `ReaderPaginatedFooter.tsx`, `ReaderView.tsx`, `GuestCanvasReader.tsx`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`: chạm chân trang mở popover thanh trượt tua nhanh chương (chỉ commit khi thả tránh đốt Token Bucket khách) & vị trí `%` trong chương cho cả Owner & Guest (cuộn dọc + lật trang).
- `KeyboardShortcutsModal.tsx`, `AuthenticatedLibraryShell.tsx`, `Library2DDialogsHost.tsx`: modal tra nhanh phím tắt (phím `?`) nạp lười cho cả Thư viện & Trình đọc.
- `ModalShell.tsx`: khung hộp thoại thống nhất (`createPortal` + `useBodyScrollLock` + focus-trap + stack `Esc`), áp dụng cho toàn bộ 11 modal thiếu khoá cuộn nền trên mobile (`BookEditModal`, `BookInfoModal`, `BulkShelfModal`, `DeleteConfirmModal`, `ShelfRenameModal`, `ShelfCoverPickerModal`, `ShelfTagsModal`, `ShelfBatchNoteModal`, `ShelfAccessModal`, `CollectionManagerModal`, `ReaderBookCommunityBlock`).
- `src/index.css`, `src/styles/effects.css`, `src/styles/reader.css`: bổ sung `@media (prefers-reduced-motion: reduce)` tắt `.reader-search-flash`, `.fade-in`, `.slide-in`, `.theme-icon-spin`.
- `LibraryHomeShelvesSection.tsx`: nạp dần theo từng lô kệ qua `IntersectionObserver` + nút *"Tải thêm kệ"* / *"Hiện tất cả"*.

## Bước tiếp theo
1. Triển khai & commit Phase 3.3 (Security Headers Worker, CSP Frontend + `public/theme-init.js`, *Đăng xuất mọi thiết bị Admin* `owner_min_iat`).
2. Triển khai & commit Phase 3.4 (Discord Presets, Ma trận quyền thành viên, Kiểm duyệt Bình luận `/usage`, Webhook cảnh báo tuỳ chọn).
3. Viết Unit Tests Wave 3, chạy sạch build/lint/test/bundle-budget, kiểm thử trình duyệt thật và cập nhật `docs/ARCHITECTURE.md` & `docs/DECISIONS.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
