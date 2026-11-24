# HANDOFF
Cập nhật: 2026-11-24 17:45 | Nhánh: feat/reader-lofi-soundscapes | Build: 🟢 typecheck / lint / build (85.39 kB gzip) / Worker tsc xanh
Nhiệm vụ hiện tại: **Đã hoàn tất vá thông báo Discord ưu tiên bìa kệ đã chọn (`PA-1`) + hỗ trợ tag Role `DISCORD_RELEASE_ROLE_ID` & deploy Worker — chờ cấu hình Role ID và mở PR vào `main`**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v3-ux-and-community-upgrades.md

## Đang làm dở
- Chờ người dùng cung cấp/cấu hình `DISCORD_RELEASE_ROLE_ID` qua `wrangler secret put DISCORD_RELEASE_ROLE_ID` để bật ping Role trên thông báo Discord.

## Xong trong nhánh này
1. **Backend Worker & Migration `0016_community_v2.sql` (đã apply D1 & deploy Worker):** `shelfRatings` toàn kho (`QĐ-3 = 3B`), đồng bộ `dailyGoalMinutes` & `readingRuler` trong `user_reader_prefs` (`QĐ-2 = 2A`), Bình luận v2 (`parent_id` 1 cấp, `chapter_number`, `PATCH` chính chủ, 5 emoji reaction, xoá dây chuyền sạch sẽ), tổng hợp tháng/năm cho `Wrapped` và deep-link Discord `/?shelf=`.
2. **Bản vá cắt tên kệ dài (`> 6` từ), `SS/EX/SP Tập X`, ưu tiên bìa kệ & tag Role Discord (`D-037`):** giữ nguyên tên bộ dài tới 24 từ, tách chuẩn nhãn `SS Tập X`, thông báo Discord luôn ưu tiên bìa kệ đại diện đã chọn (`shelf_prefs.cover_book_id`, `PA-1`) và hỗ trợ tag Role qua `DISCORD_RELEASE_ROLE_ID` (`allowed_mentions.roles`).
3. **Nhóm 1 (Hình ảnh & UX Kho sách):** Ambient Cover Blur + màu nhấn `16×16`, chồng bìa Tập 2 & Tập 3 thật xòe quạt (`PA-A` — `ShelfFanStack.tsx`) + nếp gáy sách, huy hiệu `★` & sắp xếp `rating_desc`, Edge Fades, pháo giấy nạp lười, View Transitions, `useShelfDeepLink`.
4. **Nhóm 2 (Trình đọc Chuyên sâu & Nhạc nền Đọc sách):** 3 bản nhạc nền Piano/Lofi + tiếng môi trường thật nối vòng lặp mượt tại `public/sounds/*.m4a` (`PA-A`: *Mưa đêm*, *Thư phòng ấm*, *Gió rừng anh đào*; đã bỏ chủ đề củi lửa thừa; `0` CDN, `0 B` R2) + Sleep Timer, bóng gáy 2 cột + trượt trang `220ms`, **Thanh dẫn mắt** chuẩn cho cả Cuộn dọc & **Lật trang 2 cột** (khoá từng đoạn theo cột trái → phải bằng chuột/vuốt dọc/`↑`/`↓`), tự cuộn `1–10`, vuốt mép trái `24px` Mobile chỉnh `nightDimPercent`, kéo đáy sang chương, Furigana `<ruby><rt>`.
5. **Nhóm 3 (Command Palette, Wrapped & Bình luận v2):** `CommandPaletteModal` mở thuần bằng phím tắt `Ctrl+K` / `⌘K` (không thêm nút rối trên Header), `DailyGoalCard` + `Ofu's Library Wrapped` xuất Poster PNG bằng Canvas 2D thuần, và UI Bình luận v2 (sửa, trả lời 1 cấp, 5 reaction, tự che bình luận vượt chương đang đọc).

## Bước tiếp theo
1. Cài secret `DISCORD_RELEASE_ROLE_ID` trên Worker và bấm thử *Thông báo Discord* để kiểm tra bìa kệ + ping Role.
2. Mở Pull Request từ nhánh `feat/reader-lofi-soundscapes` vào `main` để GitHub Actions tự động deploy lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc ngoài Git.
