# HANDOFF
Cập nhật: 2026-11-23 08:30 | Nhánh: feat/locked-entrance-link | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Thêm nút dẫn sang `/entrance` ở trang `/locked` và chuẩn hoá ô nhập mã trên `/entrance` về 1 ô đơn duy nhất (`D-027`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Trên nhánh `feat/locked-entrance-link` (tách từ `origin/main` sau PR #14):
  1. **Nút dẫn tới `/entrance` trên trang `/locked` (`src/lib/gateRoutes.ts`, `src/components/AuthGate.tsx`):** bổ sung `navigateGateRoute('entrance')` (`history.pushState` không tải lại trang, hỗ trợ nút Back trình duyệt & mở tab mới) cùng nút **"Đến cổng nhập khoá"** trên màn hình `Closed`.
  2. **Chuẩn hoá ô nhập mã trên `/entrance` về 1 ô đơn (`src/components/AuthGate.tsx`):** bỏ lưới 12 ô `3×4`, gom gọn thành 1 ô nhập mã duy nhất kèm nút ẩn/hiện ký tự (`Eye`/`EyeOff`), tự động làm sạch khoảng trắng/dấu gạch khi dán key Discord 12 ký tự và tắt ép viết hoa trên bàn phím điện thoại (`autoCapitalize="none"`).

## Bước tiếp theo
1. Mở Pull Request `feat/locked-entrance-link` vào `main` và bấm Merge khi CI xanh để đưa lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #14 (`fix/mobile-admin-header`):** Gọn header Admin mobile, gỡ lọc định dạng, tối ưu cuộn 144 FPS & logo mèo đọc sách mới đã merge vào `main`.
- **PR #13 (`feat/miku-cursors`)**, **PR #12 (`D-031`)**, **PR #11 (`D-030`):** đã merge vào `main`.
