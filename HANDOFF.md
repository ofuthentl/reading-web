# HANDOFF
Cập nhật: 2026-11-23 14:16 | Nhánh: fix/audit-bugs-drop-pdf-and-fonts | Build: 🟢 typecheck · 🟢 ESLint 0/0 · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Vá lỗi tồn đọng toàn diện, gỡ bỏ PDF (`D-033`), 4 chế độ nền App 2D + Reader & font tiếng Việt tự lưu trữ (`docs/plans/audit-fixes-drop-pdf-and-fonts.md`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- **Phase 1–3 (Xong):** Gỡ PDF & drei; vá Backend Worker + D1/R2; font tiếng Việt cục bộ 0 CDN (`Literata`, `Be Vietnam Pro`, `JetBrains Mono`) + 4 chế độ nền (`Ban ngày` trắng sáng `#fcfbf8` · `Giữa trưa` giấy kem ấm `#f6f1e7`/`#f4ecd8` · `Chiều tối` `#0d1117` · `Đêm khuya` `#060608`) giữ nguyên 100% 3D + sửa B1 & M-04.
- **Phase 4a (Xong):**
  - Vá `H-01` (memoize `handleAuthenticated` trong `App.tsx`), `H-02` (fail-safe `DEFAULT_GUEST_SESSION` ở Cloud mode khi chưa có token), `H-06` (reset store/bộ lọc/kệ khi 401 hoặc hết hạn, truyền `onApiError` xuống Search & Bookmarks), `L-06` (hẹn giờ hết hạn chia chặng > 24.85 ngày).
  - Vá `H-04` (LRU cap 24 `ImageBitmap` trong `useGuestChapterStream`), `H-09` (`didDragRef` + `touch-none` + wheel non-passive ở `ReaderImageLightbox`), `M-05` (`onCloseSettings` dừng sự kiện, hoàn thành chương cuối 1 trang, cleanup RAF ảnh), `M-09` (chặn `Alt/Ctrl/Meta` + drawer/settings mở khi bấm mũi tên, đồng bộ `completedRef`), `M-10` (`cancelOpeningBook` + `AbortController`), `L-04` (cuộn `ReaderSettingsPopover` mobile ngang), `L-05` (NFC trước slice tìm kiếm).
- Đang chuyển sang **Phase 4b** (Store, Modals, Parsers, UX/A11y) và **Phase 5** (3D fixes, `DECISIONS.md`, `ARCHITECTURE.md`, kiểm định thực tế).

## Bước tiếp theo
1. Thực hiện Phase 4b (`useLibraryDataStore`, `api.ts`, `shelfPrefs`, `shelfSummary`, `BookInfoModal`, `ShelfTagsModal`, `ShelfAccessModal`, `ShelfBatchNoteModal`, `AdminProtectionModal`, `guestPackBuilder`, `useCardReveal`, `mikuCursorAnimator`, keyboard guards, dọn `formatFilter` thừa) và commit.
2. Thực hiện Phase 5 (3D fixes, docs & kiểm định thực tế PC/Mobile/Worker).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 4a:** Vá toàn bộ lỗi Auth, Trình đọc, Lightbox & Guest Stream + đảo đúng màu `Ban ngày` (trắng) / `Giữa trưa` (kem ấm).
