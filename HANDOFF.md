# HANDOFF
Cập nhật: 2026-11-24 11:12 | Nhánh: fix/post-wave4-core-and-mobile | Build: 🟢 typecheck / lint xanh
Nhiệm vụ hiện tại: Triển khai **PR 1** của kế hoạch `docs/plans/post-wave4-audit-fixes.md` (vá toàn bộ lỗi Backend + Trình đọc + Mobile iOS + 2D/PWA, tách riêng 3D sang PR 2; đã chốt `1A / 2A / 3A / 4A`, giữ nguyên `weeklyPopular` tính cả bộ `restricted`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã xong **Phase 1** (Backend Worker + migration `0015`) và **Phase 2** (Lõi Reader, Sync & Parser EPUB/DOCX).
- Còn lại trong PR 1: **Phase 3** (Reader UX, tương phản chéo theme & 2 lỗi Mobile iOS) → **Phase 4** (2D, Modals, Routing, PWA & CSS) → Kiểm định E2E & đồng bộ sổ sách (`D-038`).

## Bước tiếp theo
1. Triển khai **Phase 3**: mở rộng `ReaderThemePalette` (`3A`), sửa tương phản nút `Tới ↗`/bình luận/popover, sửa 2 lỗi Mobile iOS (popover bôi màu tự lật lên đỉnh + chân trang Lật trang 1 hàng), ổn định Paginated/Scroll, Highlight/Search/Footnotes/Gallery & phím tắt Guest.
2. Tiếp tục **Phase 4** → chạy migration `0015` local + kiểm thử trình duyệt PC/Mobile → cập nhật `docs/DECISIONS.md` & `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Phase 2 (`fix/post-wave4-core-and-mobile`):**
  - Đồng bộ tiến độ & cài đặt: khởi tạo `apiFetch(..., { keepalive: true })` đồng bộ trước IDB khi `pagehide` và bảo toàn `readingSeconds` trong `api.ts`; flush `pendingSecondsRef` khi tắt timer (`useActiveReadingTimer.ts`); gỡ `appTheme` khỏi deps tải lại cloud settings (`useBookReader.ts`) diệt lỗi giật ngược theme.
  - IndexedDB `cache.ts`: phục hồi kết nối `onclose`/`onversionchange`/`onblocked`, chờ `tx.oncomplete`, ném `QuotaExceededError` rõ ràng khi ghi Local Dev thất bại (`apiAdminMutations.ts`).
  - Bảo mật & Parser EPUB/DOCX: giữ `epub:type`/`role`, lọc `style`/`srcset`/media tags, thêm `sanitizeSvgBlob` chống XSS SVG; hỗ trợ XHTML tự đóng (`<title/>`), `resolveZipPath` đầu `/`, tìm tệp zip không phân biệt hoa-thường + fallback `%20`, ưu tiên `toc` trước `landmarks`, tách `docxChapters.ts` (gọn `<500` dòng), hỗ trợ footnotes/endnotes, `txbxContent`, `colspan` và siết regex tách chương DOCX.
- **Phase 1:** Fail-closed `D-030` + chuẩn hoá NFC; siết `D-028` (`2A`); `cleanupOrphanShelves` (`4A`); nguyên tử hoá SQL chống race & vá mốc 00:00 UTC+7; vá `discordRelease.ts`; migration `0015`.
