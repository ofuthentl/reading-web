# HANDOFF
Cập nhật: 2026-11-24 14:21 | Nhánh: feat/v3-ux-and-community-upgrades | Build: 🟢 typecheck / lint / build (85.13 kB gzip) / Worker tsc xanh
Nhiệm vụ hiện tại: **Triển khai đợt nâng cấp v3 (`D-039`: `1B / 2A / 3B`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v3-ux-and-community-upgrades.md

## Đang làm dở
- **Đã xong Phase 1 (Backend Worker v3 + Migration `0016_community_v2.sql` + D1/Worker deploy + đăng lại thông báo Discord 19 tập).**
- **Đã xong Phase 2 (Nhóm 1 — Hình ảnh, Điểm sao `★`, Hiệu ứng & Deep-link `?shelf=`).**
- **Đã xong Phase 3 (Nhóm 2 — Trình đọc Chuyên sâu, Web Audio Soundscapes & Furigana):**
  - 4 bối cảnh Web Audio thuần (`readerSoundscapes.ts`, `0` phụ thuộc `three`), âm lật giấy, Sleep Timer `15/30/60p` fade-out, tự đóng `AudioContext` khi thoát sách.
  - Bóng gáy sách giữa 2 cột + trượt trang mượt `220ms` cho `ReaderPaginatedView` & `GuestCanvasPaginatedView`.
  - **Thanh Dẫn Mắt (`Reading Ruler`):** ở chế độ Cuộn dọc giữ nét đoạn trung tâm; ở chế độ **Lật trang 2 cột** khoá độc lập từng đoạn theo cột trái → cột phải kèm vạch dẫn dọc mảnh `2.5px` (rê chuột, vuốt dọc hoặc phím `↑`/`↓` tự chuyển cột & sang trang, không kẻ khung ngang cắt chữ) cho cả DOM lẫn `<canvas>` (`D-028`).
  - Tự động cuộn rảnh tay (`1–10`), vuốt mép trái `24px` Mobile chỉnh `nightDimPercent`, kéo đáy chuyển chương, và bảo toàn/vẽ `<ruby><rt>` Furigana trên cả DOM & `<canvas>`.
- **Đang làm tiếp:** Phase 4 (Nhóm 3 — Command Palette `Ctrl+K`, Daily Goal & `Ofu's Library Wrapped` PNG, và giao diện Bình luận v2).

## Bước tiếp theo
1. Triển khai `CommandPaletteModal` (`Ctrl+K`), `DailyGoalCard` + `ReadingWrappedModal` (`wrappedPosterCanvas.ts`), và nâng cấp `CommunityReviewsSection` v2 (sửa, trả lời 1 cấp, 5 reaction, làm mờ bình luận vượt chương đang đọc).
2. Kiểm thử Worker D1 local + trình duyệt Desktop/Mobile và cập nhật `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc ngoài Git.

## Xong gần nhất
- **PR #26 (`fix/post-wave4-core-and-mobile`, `D-038`):** đã merge vào `origin/main`.
