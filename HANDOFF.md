# HANDOFF
Cập nhật: 2026-11-25 19:08 | Nhánh: feat/v5-wave3-reader-ux-security-discord | Build: 🟢 XANH (`typecheck`, `lint`, `39/39` test, `build` `54.01 kB`, `check:bundle`, Worker `tsc`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 3 (`D-046` — `QĐ-5A`, migration `0019`) — Đã áp migration `0019` remote D1, deploy Worker & push nhánh sẵn sàng tạo PR**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Không còn việc dở dang trong Wave 3; chỉ còn mở Pull Request từ `feat/v5-wave3-reader-ux-security-discord` vào `main` và merge khi CI xanh.

## Xong trong nhánh này
### Migration D1 `0019_v5_security_and_presets.sql` (`QĐ-5A`)
- Tạo `0019_v5_security_and_presets.sql` + đồng bộ `schema.sql` (`app_security_state`, `discord_access_presets`, `discord_access_preset_members`, backfill `rl_last_strike_at`, thêm index tra cứu mới & xoá 2 index dư thừa ở migration & runtime).

### Phase 3.1 — Tải trước chương kế tiếp cho Khách Discord (Speculative Prefetch)
- `guestCrypto.ts`, `useGuestChapterStream.ts`, `GuestCanvasReader.tsx`: guard `shouldPrefetchNextGuestChapter` (`>= 78%`, bỏ qua chương khoá/đã cache/cooldown `429` 60s), `AbortController` riêng seed `chapterCacheRef` giữ trọn thuỷ vân & `D-028`.

### Phase 3.2 — Thanh tua `%` cuốn kiểu Kindle trong Mục lục, Phím tắt `?`, `<ModalShell>` & Nạp dần Trang chủ
- `ReaderKindlePercentBar.tsx`, `readingEstimate.ts`, `ReaderTocDrawer.tsx`, `ReaderOverlaysHost.tsx`, `ReaderFooterStatusBar.tsx`, `ReaderPaginatedFooter.tsx`, `ReaderView.tsx`, `GuestCanvasReader.tsx`: thanh trượt & ô nhập `%` toàn cuốn kiểu Kindle (theo trọng số chương + vạch chia chương + xem trước chương đích) ghim đáy ngăn kéo `Mục lục`, chạm thanh chân trang mở thẳng ngăn kéo.
- `KeyboardShortcutsModal.tsx`, `ModalShell.tsx` (chuẩn hoá 13 modal), `@media (prefers-reduced-motion: reduce)` và nạp dần theo lô kệ trong `LibraryHomeShelvesSection.tsx`.

### Phase 3.3 — Security Headers Worker, CSP Frontend & *Đăng xuất mọi thiết bị Admin*
- Worker (`securityHeaders.ts`, `index.ts`, `r2Files.ts`, `guestPack.ts`): gắn `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` trên mọi phản hồi.
- Frontend (`public/theme-init.js`, `public/sw.js`, `cspPolicy.ts`, `index.html`, `vite.config.ts`): tách inline theme script & gắn CSP nghiêm ngặt (`script-src 'self'` ở prod) + `referrer` meta.
- Worker + Frontend (`securityStateDb.ts`, `auth.ts`, `adminRoutes.ts`, `adminSecurityApi.ts`, `AdminRevokeSessionsAction.tsx`): nhúng `iat` Owner token + `owner_min_iat` (cache isolate `15s` + invalidate tức thì) + `POST /api/admin/sessions/revoke-owner` + nút xác nhận 2 bước.

### Phase 3.4 — Discord Presets, Ma trận quyền, Kiểm duyệt `/usage` & Webhook Cảnh báo
- Worker (`discordPresetsDb.ts`, `discordAccessMatrixDb.ts`, `usageRecentCommunityDb.ts`, `adminAlerts.ts`, `adminRoutes.ts`, `rateLimitDb.ts`, `guestRoutes.ts`, `index.ts`): CRUD `/api/admin/discord-presets`, `/api/admin/discord-guests/:id/access-matrix` + `/revoke-all`, `/api/admin/usage/recent-community`, cảnh báo tuỳ chọn `DISCORD_ADMIN_ALERT_WEBHOOK_URL` (`ctx.waitUntil`).
- Frontend (`discordPresetsApi.ts`, `DiscordPresetPickerBar.tsx`, `AdminGuestAccessMatrixPanel.tsx`, `AdminRecentCommunityCard.tsx`, `ShelfAccessModal.tsx`, `BookAccessModal.tsx`, `AdminDiscordGuestsPanel.tsx`, `AdminUsageView.tsx`).

### Nghiệm thu & Kiểm thử Wave 3
- Bổ sung `tests/wave3SecurityPresetsAndPrefetch.test.ts` & test ánh xạ `%` Kindle (`39/39` unit test pass); kiểm thử E2E trình duyệt thật bản prod CSP + Worker cục bộ đạt `0` lỗi CSP/console across cả 7 hạng mục Wave 3; cập nhật `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` & checklist `docs/plans/v5-bugfixes-and-upgrades.md`.

## Bước tiếp theo
1. Mở Pull Request trên GitHub từ `feat/v5-wave3-reader-ux-security-discord` vào `main`, chờ CI xanh và merge để tự deploy Frontend lên `https://ofu.lol`.
2. (Tuỳ chọn) Nếu muốn bật cảnh báo Discord cho Admin khi chạm strike 10 / khoá IP brute-force, cấu hình `npx wrangler secret put DISCORD_ADMIN_ALERT_WEBHOOK_URL` trong `workers/r2-storage`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
