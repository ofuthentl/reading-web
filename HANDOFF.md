# HANDOFF
Cập nhật: 2026-11-24 14:55 | Nhánh: feat/v3-ux-and-community-upgrades | Build: 🟢 typecheck / lint / build (85.39 kB gzip) / Worker tsc xanh
Nhiệm vụ hiện tại: **Đã hoàn tất đợt nâng cấp v3 (`D-039`: `1B / 2A / 3B`) + Vá tên kệ dài & thông báo Discord — sẵn sàng mở PR vào `main`**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v3-ux-and-community-upgrades.md

## Đang làm dở
- Không còn việc dở dang trên nhánh `feat/v3-ux-and-community-upgrades`.

## Xong trong nhánh này
1. **Backend Worker & Migration `0016_community_v2.sql` (đã apply D1 & deploy Worker):** `shelfRatings` toàn kho (`QĐ-3 = 3B`), đồng bộ `dailyGoalMinutes` & `readingRuler` trong `user_reader_prefs` (`QĐ-2 = 2A`), Bình luận v2 (`parent_id` 1 cấp, `chapter_number`, `PATCH` chính chủ, 5 emoji reaction, xoá dây chuyền sạch sẽ), tổng hợp tháng/năm cho `Wrapped` và deep-link Discord `/?shelf=`.
2. **Bản vá cắt tên kệ dài (`> 6` từ) & `SS/EX/SP Tập X`:** giữ nguyên tên bộ dài tới 24 từ, tách chuẩn nhãn `SS Tập X`, làm sạch dữ liệu D1 và đăng lại thông báo 19 tập lên kênh Discord.
3. **Nhóm 1 (Hình ảnh & UX Kho sách):** Ambient Cover Blur + màu nhấn `16×16`, nếp gáy sách (đã gỡ `Stacked Deck` trên `ShelfCoverCard` theo phản hồi thẩm mỹ), huy hiệu `★` & sắp xếp `rating_desc`, Edge Fades, pháo giấy nạp lười, View Transitions, `useShelfDeepLink`.
4. **Nhóm 2 (Trình đọc Chuyên sâu & Web Audio):** 4 bối cảnh Web Audio thuần (`0` `three`) + Sleep Timer, bóng gáy 2 cột + trượt trang `220ms`, **Thanh dẫn mắt** chuẩn cho cả Cuộn dọc & **Lật trang 2 cột** (khoá từng đoạn theo cột trái → phải bằng chuột/vuốt dọc/`↑`/`↓`), tự cuộn `1–10`, vuốt mép trái `24px` Mobile chỉnh `nightDimPercent`, kéo đáy sang chương, Furigana `<ruby><rt>`.
5. **Nhóm 3 (Command Palette, Wrapped & Bình luận v2):** `CommandPaletteModal` mở thuần bằng phím tắt `Ctrl+K` / `⌘K` (không thêm nút rối trên Header), `DailyGoalCard` + `Ofu's Library Wrapped` xuất Poster PNG bằng Canvas 2D thuần, và UI Bình luận v2 (sửa, trả lời 1 cấp, 5 reaction, tự che bình luận vượt chương đang đọc).

## Bước tiếp theo
1. Push nhánh `feat/v3-ux-and-community-upgrades` và mở Pull Request vào `main` khi người dùng yêu cầu.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc ngoài Git.
