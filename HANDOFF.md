# HANDOFF
Cập nhật: 2026-11-24 23:15 | Nhánh: feat/v4-spine-shelf-and-catalog | Build: 🟢 typecheck / lint / Worker tsc / build xanh (`84.78 kB` gzip)
Nhiệm vụ hiện tại: **Triển khai nâng cấp v4 (8 hạng mục: A1, A2, C12 chỉ độ đậm chữ, C13, D15 bỏ Tạm ngưng, D16, D18, D19 Khoá Tập/Chương)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Chạy kiểm thử tích hợp cục bộ Worker + D1 (migration `0018`) và trình duyệt thực tế Desktop/Mobile trước khi cập nhật tài liệu cuối.

## Xong trong nhánh này
1. **Phase 1 — Backend Worker, Migration `0018` & Bảo mật 3 tầng (`Bộ → Tập → Chương`):**
   - Hoàn tất migration `0018`, chấm nửa sao `0.5..5.0`, `rereadCount`, whitelist `fontWeight` + `eyeBreakMinutes`, liên kết `shelf_relations` và phân quyền 3 tầng `Bộ → Tập → Chương` (`0 B` re-pack R2).
2. **Phase 2 — Giao diện Thị giác (`A1` Tủ Gáy Sách 2D & `A2` Hiệu ứng Ánh Kim):**
   - Hoàn tất `SpineBookshelfView` (hộp cứng 90° Light Novel Nhật, hover-intent `40ms`, `ResizeObserver`, cảm ứng 2 chạm, 4 nền) & `.cover-foil-card`.
3. **Phase 3 — Trình đọc (`C12` Độ đậm chữ, `C13` Tự học WPM + Nhắc nghỉ mắt & UI Khoá chương `D19`):**
   - Đồng bộ độ đậm chữ `Thường` · `Vừa` · `Đậm` trên cả DOM & `<canvas>`, tự học WPM bằng EMA (`120..450`), nhắc nghỉ mắt `30/45/60p`, và giao diện chương khoá trên trình đọc khách.
4. **Phase 4 — Cộng đồng, Hệ sinh thái Kho sách & Quản trị (`D15`, `D16`, `D18`, `D19`):**
   - `HalfStarRatingControl.tsx`, `useLibraryUserActions.ts`, `BookCard.tsx`, `BookInfoModal.tsx`, `ReaderChapterEndNav.tsx`, `ReadingStatsModal.tsx`: chấm nửa sao `0.5★–5.0★` và đếm lượt Đọc lại `↻ ×N` (không thêm Tạm ngưng).
   - `shelfRecommendations.ts`, `ShelfDetailHeroActions.tsx`, `ShelfRelatedStrip.tsx`, `ShelfRelationsModal.tsx`, `LibraryCatalogModals.tsx`: liên kết 2 chiều Vũ trụ/Ngoại truyện & dải gợi ý *Cùng gu trong kho* (`0` query D1, lọc `D-030` cho khách).
   - `quoteMarkdownExport.ts`, `QuoteVaultModal.tsx`, `libraryHealthAudit.ts`, `AdminLibraryHealthModal.tsx`: xuất Markdown trích dẫn riêng cho Owner & kiểm tra sức khoẻ kho sách 1 chạm (`LibraryHeader` + `Ctrl+K`).
   - `bookAccessApi.ts`, `BookChapterLockList.tsx`, `BookAccessModal.tsx`, `AdminModalsHost.tsx`: modal Admin phân quyền Tập sách (`Theo bộ` / `Đọc thử` / `Khoá riêng`) & khoá từng Chương.

## Bước tiếp theo
1. Kiểm thử tự động Worker + D1 cục bộ (chấm nửa sao, liên kết kệ, bảo mật 3 tầng Tập/Chương `403` không rò rỉ) & trình duyệt thật Desktop (`1280×800`) + Mobile (`390×844`).
2. Ghi quyết định `D-042` vào `docs/DECISIONS.md`, cập nhật `docs/ARCHITECTURE.md` + `docs/plans/v4-spine-shelf-and-catalog.md` và bàn giao.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc ngoài Git.
