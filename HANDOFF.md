# HANDOFF
Cập nhật: 2026-11-25 18:24 | Nhánh: feat/v5-wave3-reader-ux-security-discord | Build: 🟢 XANH (`typecheck`, `lint`, Worker `tsc`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 3 (`D-046` — `QĐ-5A`, migration `0019`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Hoàn tất Migration `0019` và Phase 3.1 (Speculative Prefetch chương kế cho Khách Discord).
- Đang triển khai Phase 3.2: Thanh tua nhanh chân trang trình đọc, Bảng phím tắt `?`, `<ModalShell>` thống nhất cho ~11 modal, `@media (prefers-reduced-motion: reduce)` và nạp dần Trang chủ.

## Xong trong nhánh này
### Migration D1 `0019_v5_security_and_presets.sql` (`QĐ-5A`)
- Tạo `0019_v5_security_and_presets.sql` + đồng bộ `schema.sql` (`app_security_state`, `discord_access_presets`, `discord_access_preset_members`, backfill `rl_last_strike_at`, xoá 2 index dư thừa ở migration & runtime).

### Phase 3.1 — Tải trước chương kế tiếp cho Khách Discord (Speculative Prefetch)
- `src/lib/guestCrypto.ts`: đính `status` & `retryAfterSec` (từ `Retry-After`) vào lỗi tải chương/ảnh khách.
- `src/hooks/useGuestChapterStream.ts`, `src/components/GuestCanvasReader.tsx`: bổ sung guard thuần `shouldPrefetchNextGuestChapter` (ngưỡng `>= 78%` cả cuộn dọc lẫn lật trang, bỏ qua chương khoá `D-042`, bỏ qua nếu đã nằm trong `chapterCacheRef` hoặc đang trong cooldown `429`), tải ngầm đúng 1 chương `chapterIndex + 1` bằng `AbortController` riêng (huỷ ngay khi đổi chương/đóng sách, không evict chương hiện tại khỏi LRU RAM, giữ trọn thuỷ vân & `D-028`).

## Bước tiếp theo
1. Hoàn tất & commit Phase 3.2 (Thanh tua nhanh, Bảng phím tắt `?`, `<ModalShell>`, `prefers-reduced-motion`, nạp dần Trang chủ).
2. Triển khai Phase 3.3 (Security Headers Worker, CSP Frontend, *Đăng xuất mọi thiết bị Admin* `owner_min_iat`).
3. Triển khai Phase 3.4 (Discord Presets, Ma trận quyền, Kiểm duyệt `/usage`, Webhook cảnh báo tuỳ chọn) + Unit Tests + Kiểm thử trình duyệt.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
