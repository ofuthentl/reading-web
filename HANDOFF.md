# HANDOFF
Cập nhật: 2026-11-25 13:15 | Nhánh: feat/optimize-book-open-and-upload | Build: 🟢 XANH (`index-*.js = 85.92 kB` gzip <= `86.04 kB`)
Nhiệm vụ hiện tại: **Tối ưu Toàn diện Tốc độ Mở Sách & Tải Sách Lên — Mức 2 (`D-045` — chốt `1A`, `2A`, `3A`, `0` migration D1, `0 B` re-pack R2)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/optimize-book-open-and-upload.md

## Đang làm dở
- Không có — toàn bộ thay đổi Frontend + Cloudflare Worker đã hoàn tất, qua 7/7 suite test Worker, 10/10 bước kiểm thử trình duyệt thật (`0` lỗi console), `typecheck`, `lint` (`0/0`), `build` và `tsc --noEmit` Worker; Cloudflare Worker đã deploy bản mới lên production và nhánh đã push lên `origin`.

## Xong trong nhánh này
1. **Tối ưu Mở sách trên Frontend (`1A` — `sanitizeHtml.ts`, `zipMediaCache.ts`, `parsers.ts`, `docxParser.ts`, `docxChapters.ts`, `api.ts`, `useBookReader.ts`, `ActiveReaderHost.tsx`, `ReaderView.tsx`, `ReaderOverlaysHost.tsx`, `ReaderTocDrawer.tsx`, `ReaderIllustrationGallery.tsx`):**
   - Cắt 5–6 vòng parse/serialize XHTML xuống 1 bước (`sanitizeHtmlToBody` dùng `DOMPurify RETURN_DOM`, giữ fallback XML an toàn khi có thẻ tự đóng non-void).
   - Giải nén song song toàn bộ spine XHTML, giải nén lười ảnh theo chương + prefetch chương kế tiếp lúc rảnh (`createLazyZipMediaController`), Phòng tranh Owner nạp lười `OwnerLazyThumb` qua `IntersectionObserver`, ghi cache IndexedDB ở nền và preload chunk trình đọc không phình entry (`85.92 kB` gzip).
2. **Tối ưu Tải sách lên trên Frontend (`2A` — `epubFootnotes.ts`, `guestPackHtml.ts`, `guestPackBuilder.ts`, `apiAdminMutations.ts`, `uploadBatchHelpers.ts`, `UploadQueueList.tsx`):**
   - Tái sử dụng 1 lần mở ZIP duy nhất (`extractUploadMetadata(..., { keepZip: true })`), dùng chung 1 `DOMParser` cho block & chú thích, nén gzip chương song song (`concurrency = 6`), gắn `media[i].ch`.
   - Dựng gói `OFGP` trên CPU song song với `PUT /file`, sau đó tải song song `PUT /cover` & `PUT /guest-pack`; nâng hàng đợi tải nhiều cuốn lên thích ứng (`concurrency = 2` cho `<= 40 MB`, `1` cho `> 40 MB`, giữ chuẩn gom sách lẻ `D-044`); memoize preview `UploadQueueList.tsx`.
3. **Tối ưu Cloudflare Worker & Guest (`3A` — `guestAccessBatchDb.ts`, `guestPackUpload.ts`, `guestPack.ts`, `guestRoutes.ts`, `bookUploadRoutes.ts`, `guestCrypto.ts`, `useGuestChapterStream.ts`, `GuestCanvasReader.tsx`):**
   - Gộp phân quyền 3 tầng + `file_key` + manifest vào 1 lượt `db.batch`; trả kèm `initialChapter` ngay trong `GET /api/guest/books/:id/toc?includeChapter=` (cắt 2 vòng mạng → 1 vòng); kiểm tra khoá ảnh `O(1)` từ `media.ch` + cache LRU 32 `packKey` cho gói cũ; tải song song `3` ảnh Guest gom batch `setImageSizes`; rút D1 upload còn 2 batch/endpoint giữ nguyên tử hạn mức `9.0 GiB`.
   - Đã deploy thành công Worker `arcane-library-api` lên production.

## Bước tiếp theo
1. Mở Pull Request từ `feat/optimize-book-open-and-upload` vào `main` và bấm Merge khi CI xanh để GitHub Pages tự động deploy bản Frontend mới lên `https://ofu.lol` (Worker đã sẵn sàng trên production và tương thích ngược 100%).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ngoài Git ở thư mục gốc.
