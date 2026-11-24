# HANDOFF
Cập nhật: 2026-11-24 14:42 | Nhánh: feat/v3-ux-and-community-upgrades | Build: 🟢 typecheck / lint / build (85.39 kB gzip) / Worker tsc xanh
Nhiệm vụ hiện tại: **Kiểm thử tổng thể & hoàn tất tài liệu đợt nâng cấp v3 (`D-039`: `1B / 2A / 3B`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v3-ux-and-community-upgrades.md

## Đang làm dở
- **Đã xong toàn bộ 4 Phase code của v3 (`Nhóm 1`, `Nhóm 2`, `Nhóm 3`) + bản vá tên kệ dài & thông báo Discord:**
  - Nhóm 1: Ambient Cover Blur + màu nhấn `16×16`, Stacked Deck + nếp gáy sách, điểm sao `★` & sắp xếp `rating_desc`, Edge Fades, pháo giấy nạp lười, View Transitions, Deep-link Discord `/?shelf=`.
  - Nhóm 2: 4 bối cảnh Web Audio thuần (`0` `three`), Sleep Timer, bóng gáy 2 cột, Thanh dẫn mắt chuẩn đọc đơn & đọc đôi 2 cột, tự cuộn `1–10`, vuốt mép trái `24px` chỉnh tối Mobile, kéo đáy chuyển chương, Furigana `<ruby><rt>` trên DOM & `<canvas>`.
  - Nhóm 3: Command Palette `Ctrl+K` (thuần phím tắt theo yêu cầu người dùng, không thêm nút rối trên Header), Mục tiêu đọc mỗi ngày + `Ofu's Library Wrapped` xuất Poster PNG bằng Canvas 2D thuần, và Bình luận v2 (sửa chính chủ, trả lời 1 cấp, 5 emoji reaction, tự che bình luận vượt chương đang đọc).
- **Đang thực hiện:** Chạy checklist kiểm thử D1/Worker local + trình duyệt Desktop/Mobile và cập nhật `docs/ARCHITECTURE.md`.

## Bước tiếp theo
1. Kiểm thử tự động Worker + D1 local (`0016_community_v2.sql`).
2. Kiểm thử trình duyệt Desktop (`1280×800`) & Mobile (`390×844`).
3. Cập nhật `docs/ARCHITECTURE.md` & `docs/plans/v3-ux-and-community-upgrades.md`, commit chốt nhánh `feat/v3-ux-and-community-upgrades`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc ngoài Git.

## Xong gần nhất
- **PR #26 (`fix/post-wave4-core-and-mobile`, `D-038`):** đã merge vào `origin/main`.
