# HANDOFF
Cập nhật: 2026-11-23 10:46 | Nhánh: fix/smooth-strip-and-mobile-motion | Build: 🟢 frontend (`85.81 kB` gzip, `0 B` three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Mượt hoá animation & lướt ngang dải Thịnh hành / Mới cập nhật và chống dính hover cảm ứng trên mobile (PA-1)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Trên nhánh `fix/smooth-strip-and-mobile-motion` (tách từ `origin/main` sau PR #17):
  1. **Phẳng hoá dải ngang & tăng preload ảnh bìa (`EditorialBookStrip.tsx`, `useCardReveal.ts`):**
     - Gỡ `card-scroll-reveal`, stagger lệch hàng và tilt nhấc `-5px` khỏi `EditorialRankedCard` → 10 thẻ nằm phẳng 1 hàng ngang cố định (`0px` nhảy dọc), nạp trước ảnh cả dải qua 1 observer ở `<section>`, thêm `overscroll-x-contain` và nút `←` `→` tròn.
     - Mở rộng `sharedPreloadObserver` lên `rootMargin: '480px 260px'` (preload cả trục ngang) và dịu `--tilt-lift` PC xuống `-2px`.
  2. **Chống dính `:hover` cảm ứng & làm dịu cuộn dọc (`tailwind.config.js`, `src/index.css`, `BookCard.tsx`, `ShelfCoverCard.tsx`):**
     - Bật `future: { hoverOnlyWhenSupported: true }`, bọc `.group:hover` CSS trong `@media (hover: hover) and (pointer: fine)` và gỡ dịch chuyển `-2px` của `.editorial-rank-num`.
     - Tắt dịch chuyển Y của `.card-scroll-reveal` trên thiết bị cảm ứng (`@media (hover: none), (pointer: coarse)`), thêm `.touch-action-visible` giữ hiện nút phụ trên tablet cảm ứng, rút gọn stagger PC còn `(index % 4) * 28ms`.
  3. Đã kiểm định `typecheck`, `lint` (`0/0`), `build` (`85.81 kB` gzip) và kiểm thử trực tiếp trên khung `390×652` (`0px` lệch dọc khi lướt ngang, `0` lỗi console).

## Bước tiếp theo
1. Mở Pull Request `fix/smooth-strip-and-mobile-motion` vào `main` và bấm Merge khi CI xanh để đưa lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #17 (`fix/mobile-reader-horizontal-overflow`):** Sửa tràn ngang nút `Đọc tiếp` tên dài trên mobile đã merge vào `main`.
- **PR #16 (`fix/mobile-reader-viewport`):** Sửa lỗi che đáy trình đọc mobile (`max-h-dvh`) & cập nhật mô tả tab Ủng hộ đã merge vào `main`.
