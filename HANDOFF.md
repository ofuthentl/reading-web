# HANDOFF
Cập nhật: 2026-11-23 15:57 | Nhánh: feat/reading-time-streak-and-reader-ux | Build: 🟢 chưa sửa code (tách sạch từ `origin/main` sau PR #20)
Nhiệm vụ hiện tại: Triển khai **Lộ trình Nâng cấp v2 (18 hạng mục chia 4 Wave)** theo kế hoạch đã duyệt tại `docs/plans/roadmap-v2-upgrades.md` & `D-036`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Kế hoạch tổng thể 4 Wave (`docs/plans/roadmap-v2-upgrades.md`) và các quyết định kiến trúc (`D-036`: PA-1 thời gian đọc + QĐ-A/B/C/D) đã được người dùng duyệt xong.
- Đã tách sẵn nhánh Wave 1 (`feat/reading-time-streak-and-reader-ux`) từ `origin/main` và lưu kế hoạch, sẵn sàng bắt đầu code ngay từ **Wave 1 · Phase 1.1**.

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
