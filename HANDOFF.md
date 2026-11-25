# HANDOFF
Cập nhật: 2026-11-25 18:41 | Nhánh: feat/v5-wave3-reader-ux-security-discord | Build: 🟢 XANH (`typecheck`, `lint`, Worker `tsc`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 3 (`D-046` — `QĐ-5A`, migration `0019`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Hoàn tất toàn bộ code Migration `0019` và 4 Phase Wave 3 (3.1 → 3.4).
- Tiếp theo: chạy bộ Unit Tests Wave 3, build kiểm tra bundle budget (`index-*.js <= 86.04 kB`), apply migration `0019` local & kiểm thử thực tế trên trình duyệt, cập nhật `docs/ARCHITECTURE.md` & `docs/DECISIONS.md`.

## Xong trong nhánh này
### Migration D1 `0019_v5_security_and_presets.sql` (`QĐ-5A`)
- Tạo `0019_v5_security_and_presets.sql` + đồng bộ `schema.sql` (`app_security_state`, `discord_access_presets`, `discord_access_preset_members`, backfill `rl_last_strike_at`, xoá 2 index dư thừa ở migration & runtime).

### Phase 3.1 — Tải trước chương kế tiếp cho Khách Discord (Speculative Prefetch)
- `guestCrypto.ts`, `useGuestChapterStream.ts`, `GuestCanvasReader.tsx`: guard thuần `shouldPrefetchNextGuestChapter` (`>= 78%`, bỏ qua chương khoá & cooldown `429`), tải ngầm 1 chương kế bằng `AbortController` riêng seed `chapterCacheRef`.

### Phase 3.2 — Thanh tua nhanh, Phím tắt `?`, `<ModalShell>` thống nhất & Nạp dần Trang chủ
- `ReaderQuickScrubberPopover.tsx`, `ReaderFooterStatusBar.tsx`, `ReaderPaginatedFooter.tsx`, `ReaderView.tsx`, `GuestCanvasReader.tsx`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`: popover thanh trượt tua nhanh chương & tỷ lệ đọc (cả Owner & Guest, cuộn dọc + lật trang).
- `KeyboardShortcutsModal.tsx`, `AuthenticatedLibraryShell.tsx`, `Library2DDialogsHost.tsx`: modal tra cứu phím tắt (`?`) nạp lười.
- `ModalShell.tsx`: chuẩn hoá `createPortal` + `useBodyScrollLock` + focus-trap + stack `Esc` cho 13 modal; bổ sung `@media (prefers-reduced-motion: reduce)`; nạp dần từng lô kệ trong `LibraryHomeShelvesSection.tsx`.

### Phase 3.3 — Security Headers Worker, CSP Frontend & *Đăng xuất mọi thiết bị Admin*
- Worker (`securityHeaders.ts`, `index.ts`, `r2Files.ts`, `guestPack.ts`): gắn `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` trên mọi phản hồi.
- Frontend (`public/theme-init.js`, `public/sw.js`, `cspPolicy.ts`, `index.html`, `vite.config.ts`): tách inline theme script & gắn CSP chặt (`script-src 'self'` ở prod) + `referrer` meta.
- Worker + Frontend (`securityStateDb.ts`, `auth.ts`, `adminRoutes.ts`, `adminSecurityApi.ts`, `AdminRevokeSessionsAction.tsx`, `AdminProtectionModal.tsx`, `AdminStorageSecurityPanel.tsx`, `AdminUsageView.tsx`, `App.tsx`): nhúng `iat` Owner token + đối chiếu `owner_min_iat` (cache 15s theo isolate + invalidate tức thì) + `POST /api/admin/sessions/revoke-owner` + nút xác nhận 2 bước.

### Phase 3.4 — Nhóm quyền Discord Presets, Ma trận quyền, Kiểm duyệt `/usage` & Webhook Cảnh báo
- Worker (`discordPresetsDb.ts`, `discordAccessMatrixDb.ts`, `usageRecentCommunityDb.ts`, `adminAlerts.ts`, `adminRoutes.ts`, `rateLimitDb.ts`, `guestRoutes.ts`, `index.ts`, `booksDb.ts`): CRUD `/api/admin/discord-presets`, `/api/admin/discord-guests/:id/access-matrix` + `/revoke-all`, `/api/admin/usage/recent-community`, và cảnh báo tuỳ chọn `DISCORD_ADMIN_ALERT_WEBHOOK_URL` (`ctx.waitUntil` + timeout 2.5s + dedup 5p) khi strike 10 hoặc IP bị khoá brute-force.
- Frontend (`discordPresetsApi.ts`, `DiscordPresetPickerBar.tsx`, `ShelfAccessModal.tsx`, `BookAccessModal.tsx`, `AdminGuestAccessMatrixPanel.tsx`, `AdminDiscordGuestsPanel.tsx`, `AdminRecentCommunityCard.tsx`, `AdminUsageView.tsx`): chọn/lưu/xoá Preset 1 chạm, xem ma trận quyền & thu hồi hàng loạt theo thành viên, và góc kiểm duyệt *"Bình luận & Đánh giá mới nhất"* nạp lười trên `/usage`.

## Bước tiếp theo
1. Chạy sạch Unit Tests Wave 3, `typecheck`, `lint`, `build`, `check:bundle`, Worker `tsc`.
2. Áp migration `0019` lên local D1, kiểm thử trình duyệt thật theo Checklist Wave 3, cập nhật `docs/ARCHITECTURE.md` & `docs/DECISIONS.md`.
3. Hỏi xác nhận người dùng trước khi apply migration `0019` remote, deploy Worker và push nhánh.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
