# HANDOFF
Cập nhật: 2026-11-25 18:22 | Nhánh: feat/v5-wave3-reader-ux-security-discord | Build: 🟢 XANH (`typecheck`, `lint`, Worker `tsc`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 3 (`D-046` — `QĐ-5A`, migration `0019`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Bắt đầu triển khai Wave 3 trên nhánh mới `feat/v5-wave3-reader-ux-security-discord` tách sạch từ `origin/main` (sau PR #37 Wave 2).
- Tiếp theo: commit Phase 3.1 (Speculative Prefetch khách Discord), sau đó triển khai Phase 3.2 → 3.4, test & kiểm thử trình duyệt.

## Xong trong nhánh này
### Migration D1 `0019_v5_security_and_presets.sql` (`QĐ-5A`)
- Tạo `workers/r2-storage/migrations/0019_v5_security_and_presets.sql` và đồng bộ `workers/r2-storage/schema.sql`: thêm bảng `app_security_state` (`owner_min_iat`), `discord_access_presets`, `discord_access_preset_members`, index phục vụ kiểm duyệt cộng đồng (`idx_library_comments_created`, `idx_library_ratings_updated`, `idx_discord_preset_members_user`), backfill `rl_last_strike_at` cho các dòng `rl_strikes > 0` còn `0`, và xoá 2 index dư thừa (`idx_usage_daily_readers_day`, `idx_comment_reactions_comment`).
- Gỡ 2 câu `CREATE INDEX IF NOT EXISTS` dư thừa tương ứng trong `usageRecorder.ts` & `communityRatingsDb.ts`.

## Bước tiếp theo
1. Commit Phase 3.1 (Tải trước ngầm chương kế tiếp cho Khách Discord).
2. Triển khai Phase 3.2 (Thanh tua nhanh, Bảng phím tắt `?`, `<ModalShell>` thống nhất, `prefers-reduced-motion`, nạp dần Trang chủ).
3. Triển khai Phase 3.3 (Security Headers Worker, CSP Frontend, *Đăng xuất mọi thiết bị Admin* `owner_min_iat`).
4. Triển khai Phase 3.4 (Discord Presets, Ma trận quyền, Kiểm duyệt `/usage`, Webhook cảnh báo tuỳ chọn) + Unit Tests + Kiểm thử trình duyệt.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
