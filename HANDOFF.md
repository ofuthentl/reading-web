# HANDOFF
Cập nhật: 2026-11-23 17:40 | Nhánh: feat/reading-time-streak-and-reader-ux | Build: 🟢 typecheck/lint/build xanh (`index-*.js = 84.98 kB` gzip, xong Phase 1.1 & 1.2)
Nhiệm vụ hiện tại: Triển khai **Wave 1** của Lộ trình Nâng cấp v2 (`docs/plans/roadmap-v2-upgrades.md` & `D-036`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- **Phase 1.1 & Phase 1.2 đã xong:** migration `0011`, Worker thời gian đọc/Streak/ReaderSettings + `GET /api/admin/usage/guests/:discordUserId`, `useActiveReadingTimer.ts`, nâng cấp `/usage` (tab `Thời gian đọc`, vá nhãn trục `0, 1, 1`, ghi chú trống, ưu tiên hiển thị độc giả/xong trước tên kệ, xổ chi tiết tập đọc theo từng khách Discord) & Lịch nhiệt Streak 90 ngày SVG thuần trong `ReadingStatsModal.tsx`.
- Đang triển khai **Phase 1.3** (Mục 4 ước tính phút còn lại, Mục 6 Typography nâng cao, Mục 7 đồng bộ `ReaderSettings` D1, Mục 8 chữ dọc *Tategaki* cho Owner, Mục 3 nhảy & nhấp nháy đoạn khớp Tìm chữ).

## Bước tiếp theo
1. **Wave 1 (`feat/reading-time-streak-and-reader-ux`):**
   - Phase 1.1: Migration `0011_reading_time_and_prefs.sql` + Worker (`progressDb.ts`, `usageRecorder.ts`, `usageDb.ts`, `GET /api/reading-stats/activity`, `GET/PUT /api/reader-settings`).
   - Phase 1.2: `useActiveReadingTimer.ts` + tab `Thời gian đọc` & vá nhãn trục `0, 1, 1` / ghi chú trống trên `/usage` + Streak & Lịch nhiệt 90 ngày trong `ReadingStatsModal.tsx`.
   - Phase 1.3: Mục 4 (ước tính phút còn lại), Mục 6/7/8 (Typography nâng cao, sync `ReaderSettings` D1, chữ dọc *Tategaki* cho Owner), Mục 3 (nhảy & nhấp nháy đúng đoạn Tìm chữ).
   - Kiểm định đầy đủ theo §7 (typecheck, lint `<= 500` dòng, build, Worker tsc, test local Wrangler + trình duyệt PC/Mobile, Owner & Guest) rồi bàn giao PR Wave 1.
2. Sau khi Wave 1 merge `main`: tiếp tục **Wave 2** (`1, 2, 5`) → **Wave 3** (`9, 11, 12, 13, 18, 19`) → **Wave 4** (`14, 15`).

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- PR #20 (`feat/admin-usage-dashboard`) đã merge vào `origin/main` và deploy production (`ofu.lol`) kèm 3 migration `0008`/`0009`/`0010`.
- Lập kế hoạch `docs/plans/roadmap-v2-upgrades.md` & chốt ADR `D-036` cho 18 hạng mục v2 (loại bỏ Mục 10, 16, 20).
