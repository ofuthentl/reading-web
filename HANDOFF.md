# HANDOFF
Cập nhật: 2026-11-23 13:52 | Nhánh: fix/audit-bugs-drop-pdf-and-fonts | Build: 🟢 frontend (`84.54 kB` gzip, `0 B` three/pdf) · 🟢 ESLint 0/0 · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Vá lỗi tồn đọng toàn diện, gỡ bỏ PDF (`D-033`), 4 chế độ nền App 2D + Reader & font tiếng Việt tự lưu trữ (`docs/plans/audit-fixes-drop-pdf-and-fonts.md`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Đã hoàn tất **Phase 1**: gỡ bỏ hoàn toàn định dạng PDF (FE + Worker + `migrations/0008_drop_pdf.sql`, xoá `pdfjs-dist` & `public/pdfjs-wasm/`), gỡ `@react-three/drei` thừa (`-48` packages), sửa sẵn `M-01` (`prioritizeGuestReadable`) và `getDisplayAuthor` trong `ReaderTocDrawer`.
- Đang triển khai tiếp theo thứ tự:
  - **Phase 2:** Vá bảo mật, tính toàn vẹn & hiệu năng Worker Cloudflare (`H-1..H-5`, `M-1..M-9`, `L-1..L-5` + `migrations/0009_perf_indexes.sql`).
  - **Phase 3:** Font tiếng Việt cục bộ 0 CDN (`Literata`, `Be Vietnam Pro`, `JetBrains Mono`) + chuẩn hoá NFC/link EPUB + 4 chế độ nền (`Ban ngày`, `Giữa trưa`, `Chiều tối`, `Đêm khuya`) cho App 2D & Reader (giữ nguyên 100% 3D) + sửa lỗi `B1`.
  - **Phase 4:** Vá toàn bộ lỗi Frontend (Auth, Trình đọc, Lightbox, Guest Stream, Store, Modals, UX/A11y).
  - **Phase 5:** Vá lỗi 3D nhỏ, cập nhật `DECISIONS.md` (`D-033`, `D-034`), `ARCHITECTURE.md` và kiểm định tổng thể.

## Bước tiếp theo
1. Thực hiện Phase 2 trên `workers/r2-storage/src/` và tạo `migrations/0009_perf_indexes.sql`.
2. Verify `npm run lint` + Worker `tsc --noEmit` rồi commit Phase 2.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 1 (nhánh hiện tại):** Gỡ hoàn toàn PDF & `@react-three/drei`, build/lint/typecheck/Worker tsc đều xanh (`84.54 kB` gzip).
- **Nhánh `feat/shelf-tags-and-author-filter`:** Thể loại bộ truyện, Tìm kiếm Nâng cao 3 trạng thái & lọc cùng tác giả (`D-032`).
