# HANDOFF
Cập nhật: 2026-11-25 14:25 | Nhánh: fix/v5-wave1-mobile-audit-and-bundle | Build: 🟢 XANH (`index-*.js = 73.24 kB` gzip `<< 86.04 kB`)
Nhiệm vụ hiện tại: **Đợt Vá Lỗi Toàn Diện & Nâng Cấp v5 — Wave 1 (`D-046` — chốt `1A`, `2A`, `3A`, `4A`, `5A`, bỏ qua mục macOS NFD)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v5-bugfixes-and-upgrades.md

## Đang làm dở
- Đã hoàn tất & kiểm chứng xanh **Wave 1 — Phase 1.1** (`typecheck`, `lint` 0/0, `build`). Tạm dừng theo yêu cầu người dùng để chuyển các Phase còn lại sang phiên mới tiết kiệm quota (bộ prompt nằm ở artifact phiên trước hoặc theo đúng từng mục trong `docs/plans/v5-bugfixes-and-upgrades.md`).

## Xong trong nhánh này (Phase 1.1)
1. **Vá rung/hở khe `<header>` trên iPhone (`QĐ-2A`):**
   - `LibraryHeader.tsx` & `AdminUsageView.tsx`: đổi `<header>` sang `fixed inset-x-0 top-0` + đệm chiều cao đồng bộ bằng `ResizeObserver`, tắt `backdrop-blur-sm` trên `< md` (giữ kính mờ trên desktop).
   - `Library2DView.tsx`: dời `overflow-x-clip` xuống `<main>`; `ShelfCoverCard.tsx` & `BookCard.tsx`: bỏ `backdrop-blur` thừa trên badge nền tối.
   - Tách `LibraryMobileOwnerMenu.tsx` mở menu gọn (`⋯`) trên mobile/tablet cho Owner truy cập nhanh *Bộ nhớ đệm*, *Sức khoẻ kho*, *Bảo mật* và *Chọn nhiều sách*.
2. **Vá văng trình duyệt RAM/Cache IndexedDB tab chính iPhone & Parser XHTML (`QĐ-3A`):**
   - `parsers.ts`: giải nén spine EPUB theo lô `4` tệp/lô và xả chuỗi nguồn ngay để cắt đỉnh RAM.
   - `sanitizeHtml.ts`: chuyển `parseAndSanitizeEpubBody` sang HTML5 fragment serializer (`createHTMLDocument().importNode`) mở rộng đủ mọi thẻ non-void (`<a/>`, `<b/>`, `<div/>`, `<script/>`...) + null-guard `<frameset>` trong `sanitizeHtmlToBody`; xoá hàm chết `sanitizeBookDocument`.
   - `zipMediaCache.ts` + `docxParser.ts` + `ReaderView.tsx` + `types.ts`: hạ concurrency bung ảnh xuống `2` trên thiết bị di động & tự `URL.revokeObjectURL` các chương xa ngoài `[active-1, active, active+1]` (giữ ghim ảnh Phòng tranh).
   - `cache.ts` + `api.ts`: kiểm tra chữ ký ZIP `PK` (`isValidZipBookBlob`) tự xoá mục IndexedDB hỏng & tải sạch lại từ R2; khử tải trùng `inFlightBookFetches`; áp trần LRU `<= 6` sách / `<= 250 MiB` trên di động (chỉ Cloud mode); chờ `waitForTransaction` + chống ghi đè ngược khi dọn cache.
3. **Giữ gọn Entry Bundle & Tài liệu (`D-013`, `D-046`):**
   - `App.tsx`: tách nạp lười `LazyLibrary2DView` kéo `index-*.js` từ `85.92 kB` xuống `73.24 kB` gzip.
   - Đã ghi `D-046` vào `docs/DECISIONS.md`, lưu kế hoạch `docs/plans/v5-bugfixes-and-upgrades.md` và cập nhật `docs/ARCHITECTURE.md`.

## Bước tiếp theo
1. Tiếp tục **Wave 1 — Phase 1.2** (Reader, Guest Canvas, Owner Lazy Media, Soundscapes & Tủ Gáy Sách) trên cùng nhánh `fix/v5-wave1-mobile-audit-and-bundle`.
2. Sau đó lần lượt chạy **Phase 1.3** (Upload/D-044/Store) → **Phase 1.4** (Cloudflare Worker) → **Phase 1.5** (AuthenticatedLibraryShell, PWA `SKIP_WAITING`, Auto-Test CI, Deploy Worker & PR Wave 1).
3. Sau khi Wave 1 merge vào `main`, mở nhánh riêng cho **Wave 2** (`feat/v5-wave2-admin-storage-and-catalog`) rồi **Wave 3** (`feat/v5-wave3-reader-ux-security-discord`).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
