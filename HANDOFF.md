# HANDOFF
Cập nhật: 2026-11-25 18:34 | Nhánh: feat/v5-wave3-reader-ux-security-discord | Build: 🟢 XANH (`typecheck`, `lint`, Worker `tsc`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 3 (`D-046` — `QĐ-5A`, migration `0019`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Hoàn tất Migration `0019` và Phase 3.1 → 3.3 (Prefetch khách, Quick Scrubber + `?` + `<ModalShell>` + nạp dần Trang chủ, Security Headers Worker + CSP Frontend + *Đăng xuất mọi thiết bị Admin*).
- Tiếp theo: triển khai Phase 3.4 (Discord Presets, Ma trận quyền thành viên, Kiểm duyệt Bình luận `/usage`, Webhook cảnh báo tuỳ chọn) + Unit Tests + Kiểm thử trình duyệt.

## Xong trong nhánh này
### Migration D1 `0019_v5_security_and_presets.sql` (`QĐ-5A`)
- Tạo `0019_v5_security_and_presets.sql` + đồng bộ `schema.sql` (`app_security_state`, `discord_access_presets`, `discord_access_preset_members`, backfill `rl_last_strike_at`, xoá 2 index dư thừa ở migration & runtime).

### Phase 3.1 — Tải trước chương kế tiếp cho Khách Discord (Speculative Prefetch)
- `guestCrypto.ts`, `useGuestChapterStream.ts`, `GuestCanvasReader.tsx`: guard thuần `shouldPrefetchNextGuestChapter` (`>= 78%`, bỏ qua chương khoá & cooldown `429`), tải ngầm 1 chương kế bằng `AbortController` riêng seed `chapterCacheRef`.

### Phase 3.2 — Thanh tua nhanh, Phím tắt `?`, `<ModalShell>` thống nhất & Nạp dần Trang chủ
- `ReaderQuickScrubberPopover.tsx`, `ReaderFooterStatusBar.tsx`, `ReaderPaginatedFooter.tsx`, `ReaderView.tsx`, `GuestCanvasReader.tsx`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`: popover thanh trượt tua nhanh chương & tỷ lệ đọc (cả Owner & Guest, cuộn dọc + lật trang).
- `KeyboardShortcutsModal.tsx`, `AuthenticatedLibraryShell.tsx`, `Library2DDialogsHost.tsx`: modal tra cứu phím tắt (`?`) nạp lười.
- `ModalShell.tsx`: chuẩn hoá `createPortal` + `useBodyScrollLock` + focus-trap + stack `Esc` cho toàn bộ 11 modal thiếu khoá cuộn nền; bổ sung `@media (prefers-reduced-motion: reduce)` trong `index.css`, `effects.css`, `reader.css`; nạp dần từng lô kệ trong `LibraryHomeShelvesSection.tsx`.

### Phase 3.3 — Security Headers Worker, CSP Frontend & *Đăng xuất mọi thiết bị Admin*
- Worker (`securityHeaders.ts`, `index.ts`, `r2Files.ts`, `guestPack.ts`): gắn `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` trên mọi phản hồi Worker.
- Frontend (`public/theme-init.js`, `public/sw.js`, `src/lib/cspPolicy.ts`, `index.html`, `vite.config.ts`): tách inline theme script sang `public/theme-init.js`, gắn `<meta name="referrer" content="no-referrer">` và CSP chặt (`script-src 'self'` ở production, đồng bộ origin `VITE_API_URL` & AniList fallback).
- Worker + Frontend (`securityStateDb.ts`, `auth.ts`, `adminRoutes.ts`, `adminSecurityApi.ts`, `AdminRevokeSessionsAction.tsx`, `AdminProtectionModal.tsx`, `AdminStorageSecurityPanel.tsx`, `AdminUsageView.tsx`, `App.tsx`): nhúng `iat` vào Owner token (tương thích ngược `exp - OWNER_TOKEN_TTL_MS`), đối chiếu `owner_min_iat` (cache 15s theo isolate + invalidate tức thì), thêm `POST /api/admin/sessions/revoke-owner` và nút *"Đăng xuất mọi thiết bị Admin"* (xác nhận 2 bước, tuỳ chọn giữ thiết bị hiện tại) tại `AdminProtectionModal` & `/usage`.

## Bước tiếp theo
1. Triển khai & commit Phase 3.4 (Discord Presets, Ma trận quyền thành viên, Kiểm duyệt Bình luận `/usage`, Webhook cảnh báo tuỳ chọn).
2. Viết bổ sung Unit Tests Wave 3, chạy sạch `typecheck`, `lint`, `test`, `build`, `check:bundle`, Worker `tsc`.
3. Kiểm thử thực tế trình duyệt, cập nhật `docs/ARCHITECTURE.md` & `docs/DECISIONS.md`, rồi xin xác nhận apply migration `0019` remote / deploy / push.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
