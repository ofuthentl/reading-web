# HANDOFF
Cập nhật: 2026-11-28 16:50 | Nhánh: fix/books-etag-stale-session | Build: 🟢 XANH (`typecheck`, `lint`, `41/41` test, `build` `54.13 kB`, `check:bundle`, Worker `tsc`)
Nhiệm vụ hiện tại: **Vá lỗi kẹt vòng lặp "Phiên truy cập 24 giờ đã hết hạn" ngay khi đăng nhập key Discord mới trên Chromium (`GET /api/books` ETag / HTTP Disk Cache) — Đã deploy Worker production & push nhánh sẵn sàng tạo PR**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã deploy Worker bản vá lên production và push nhánh `fix/books-etag-stale-session`; chỉ còn mở PR vào `main` và merge khi CI xanh để deploy phần Frontend lên `https://ofu.lol`.

## Xong trong nhánh này
- **Worker (`workers/r2-storage/src/booksEtag.ts`, `workers/r2-storage/src/index.ts`):**
  - Đổi `Cache-Control` của `GET /api/books` từ `private, no-cache` sang `private, no-store` để chặn HTTP Disk Cache của Chromium lưu phản hồi và tự đính `If-None-Match` cũ khi đổi token `Authorization`.
  - Nâng prefix Weak ETag từ `v1` lên `v2` (`W/"v2-<role>-<32hex>"`) và đưa `sessionScope` (`sessionId ?? tokenSignature`) + `sessionExpiresAt` thực vào đầu vào băm: tự chữa tức thì mọi trình duyệt đang dính cache `v1` cũ ngay lần đăng nhập kế tiếp, đồng thời vẫn giữ nguyên `304 Not Modified` trong cùng phiên.
- **Frontend (`src/lib/libraryStateCache.ts`, `src/lib/api.ts`):**
  - Thêm `cache: 'no-store'` cho `apiFetch('/api/books', ...)` và tách helper `resolveBooksResponseSession` để `304` hoặc payload cache cũ không bao giờ hạ `expiresAt` thấp hơn token hiện hành.
- **Kiểm thử & Tài liệu (`tests/booksEtagSessionIsolation.test.ts`, `tests/wave2AdminAndEtag.test.ts`, `docs/ARCHITECTURE.md`):**
  - Bổ sung test hồi quy 2 phiên liên tiếp của cùng 1 tài khoản Discord + test `resolveBooksResponseSession` (`41/41` pass) và kiểm chứng trực tiếp trên Chrome thật.

## Bước tiếp theo
1. Mở Pull Request trên GitHub từ `fix/books-etag-stale-session` vào `main`, chờ CI xanh và merge để tự deploy Frontend lên `https://ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên các tệp/thư mục chưa theo dõi sẵn ở thư mục gốc (`Gemini_Generated_Image_*.png`, `IMG_4018.JPG`, `hatsune-miku_.../`).
