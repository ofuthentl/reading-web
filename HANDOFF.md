# HANDOFF
Cập nhật: 2026-11-23 18:19 | Nhánh: feat/reading-time-streak-and-reader-ux | Build: 🟢 typecheck/lint/Worker tsc/build xanh (`index-*.js = 84.94 kB` gzip <= 86.04 kB)
Nhiệm vụ hiện tại: Hoàn tất **Wave 1** của Lộ trình Nâng cấp v2 (`docs/plans/roadmap-v2-upgrades.md` & `D-036`), sẵn sàng chạy migration `0011`, deploy Worker và mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Không còn việc dở trong **Wave 1** (đã hoàn tất trọn vẹn Phase 1.1 → 1.2 → 1.3 + 2 nâng cấp bổ sung cho `/usage`, bỏ Mục 8 *Tategaki* theo yêu cầu người dùng).

## Bước tiếp theo
1. Chạy migration `0011_reading_time_and_prefs.sql` lên D1 production (`--remote`), deploy Cloudflare Worker (`wrangler deploy`), đẩy nhánh `feat/reading-time-streak-and-reader-ux` và mở/merge PR Wave 1 vào `main`.
2. Sau khi Wave 1 merge `main`: tách nhánh `feat/reader-footnotes-gallery-highlights` triển khai **Wave 2** (Mục 1 Chú thích dịch giả, Mục 2 Tab Minh họa chống spoiler từ `guest-pack` sẵn có, Mục 5 Highlight bôi màu & Kho trích dẫn).
3. Tiếp nối **Wave 3** (`9, 11, 12, 13, 18, 19`) → **Wave 4** (`14, 15`).

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Wave 1 (`feat/reading-time-streak-and-reader-ux`, `D-036`):**
  - **Phase 1.1:** Migration `0011_reading_time_and_prefs.sql`, cộng dồn `reading_seconds` kèm kẹp trần & ngân sách đồng hồ thực `last_reading_sync_at`, mở rộng `/api/admin/usage` + thêm `GET /api/admin/usage/guests/:discordUserId`, `GET /api/reading-stats/activity` (90N cách ly `reader_scope`), `GET/PUT /api/reader-settings`.
  - **Phase 1.2:** `useActiveReadingTimer.ts` (`keepalive` khi `pagehide`/ẩn tab), nâng cấp `/usage` (tab `Thời gian đọc`, vá trục `0, 1, 1`, ghi chú trống, đưa số độc giả/xong lên trước tên kệ, xổ chi tiết tập đọc theo từng thành viên Discord), Streak & Lịch nhiệt 90 ngày SVG thuần trong `ReadingStatsModal.tsx` cho cả Owner & Guest.
  - **Phase 1.3:** Ước tính `"Còn ~X phút hết chương"`, Typography nâng cao (Căn đều/trái, thụt đầu dòng, giãn đoạn, dịu mắt ban đêm) đồng bộ D1 cho cả `ReaderView` & `GuestCanvasReader`, nhảy & nhấp nháy sáng `~2.2s` đúng đoạn khớp Tìm chữ trên DOM & `<canvas>`, kiểm thử E2E PC/Mobile cho Owner & Guest xanh 100%.
