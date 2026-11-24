# HANDOFF
Cập nhật: 2026-11-24 11:36 | Nhánh: fix/post-wave4-core-and-mobile | Build: 🟢 typecheck / lint / build (84.58 kB gzip) / Worker tsc xanh
Nhiệm vụ hiện tại: Triển khai **PR 1** của kế hoạch `docs/plans/post-wave4-audit-fixes.md` (vá toàn bộ lỗi Backend + Trình đọc + Mobile iOS + 2D/PWA, tách riêng 3D sang PR 2; đã chốt `1A / 2A / 3A / 4A`, giữ nguyên `weeklyPopular` tính cả bộ `restricted`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã hoàn tất & commit đủ cả **4 Phase code của PR 1** (Phase 1 Worker, Phase 2 Reader/Parser, Phase 3 Reader UX/Mobile iOS, Phase 4 2D/Admin/Sync/PWA/CSS).
- Còn lại: Kiểm định chạy thử thực tế (migration `0015` local + test API Worker `wrangler dev` + test trình duyệt PC `1280×800` & Mobile `390×844`) → cập nhật `docs/DECISIONS.md` (`D-038`) & `docs/ARCHITECTURE.md`.

## Bước tiếp theo
1. Chạy `wrangler d1 execute --local` áp migration `0015` + test thực tế các endpoint Backend (`D-030` NFC, `D-028` token/media `0.2`, `weeklyPopular` giữ restricted, `cleanupOrphanShelves`, `discordRelease`).
2. Chạy `vite` + kiểm thử trình duyệt thật PC & iPhone (`390×844`): xác nhận tương phản chéo theme (`Tới ↗`, bình luận, popover), hộp bôi màu tự lật lên đỉnh, chân trang Lật trang 1 hàng, modal stacking & toast `z-[90]`.
3. Ghi quyết định `D-038` vào `docs/DECISIONS.md`, cập nhật `docs/ARCHITECTURE.md`, commit tài liệu + `HANDOFF.md` cuối cùng và báo cáo kết quả cho người dùng.

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Phase 4 (`fix/post-wave4-core-and-mobile`):**
  - Modal & Toast: vá `AdminProtectionModal` (`finally` không khoá nút khi dừng ở cuốn đầu), `ToastContainer` portal `z-[90]`, tách `LazyQuoteVaultModal` khỏi backdrop `ReadingStatsModal` + nối nhảy thẳng tới vị trí trích dẫn `(chapterIndex, scrollRatio)`, thêm hook `useBodyScrollLock`.
  - Routing & Local Dev: redirect ngược `/locked`/`/entrance` khi đã đăng nhập (`App.tsx`), khôi phục phiên hoạt động và không xoá token Admin khi `/usage` gặp lỗi mạng/5xx (`AuthGate.tsx`); khoá xoá sách gốc nhầm trên `CacheManagerModal` khi chạy Local Dev.
  - Upload Wave 4 & State Sync: siết `inferBatchCommonShelf` (`>=80%` & không kéo chéo bộ khác), tách `executeSequentialUploadBatch`, chia chunk Discord `<=50` IDs, tạm hoãn tự gửi Discord khi dừng/lỗi + nút gửi thủ công, kẹp bộ đếm tiến độ & khoá nút khi `exceedsQuota`; bảo toàn `access` + NFC trong `shelfPrefs`, dọn bìa cũ khi đổi kệ, đồng bộ Local Dev `ptr`/`collections`/`community`/`highlights`, chống race toggle *Đọc sau*/*Yêu thích*, vá `legacyCoverSync` không hồi sinh sách đã xoá & đẩy `ApiAuthError`.
  - `/usage`, 2D, PWA & CSS: `AbortController` cho Refresh `/usage`, reset `activeIndex`, trục Y gọn `k`/`M`, tách `AdminStorageSecurityPanel`, sửa chọn tất cả theo `filteredBooks` trên `Library2DView`, `sw.js` timeout 1.5s & không ép `skipWaiting` khi đã có controller, sửa 3 class Tailwind v4, ưu tiên cursor `text` trước `pointer` & hồi phục từ `disabled`, tách `src/styles/reader.css`, `src/styles/cursors.css` & `readerSettingsStorage.ts` (giảm `index-*.js` xuống `84.58 kB` gzip <= `86.04 kB`).
