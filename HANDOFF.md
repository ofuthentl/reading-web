# HANDOFF
Cập nhật: 2026-11-23 14:10 | Nhánh: fix/audit-bugs-drop-pdf-and-fonts | Build: 🟢 frontend (`85.09 kB` gzip, `22.55 kB` CSS gzip, `0` CDN) · 🟢 ESLint 0/0 · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Vá lỗi tồn đọng toàn diện, gỡ bỏ PDF (`D-033`), 4 chế độ nền App 2D + Reader & font tiếng Việt tự lưu trữ (`docs/plans/audit-fixes-drop-pdf-and-fonts.md`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- **Phase 1 (Xong):** Gỡ hoàn toàn PDF (FE + Worker + `migrations/0008_drop_pdf.sql`) và `@react-three/drei`.
- **Phase 2 (Xong):** Vá toàn bộ bảo mật, tính toàn vẹn & hiệu năng Backend Worker + `migrations/0009_perf_indexes.sql`.
- **Phase 3 (Xong):**
  - Nhúng font tiếng Việt cục bộ 0 CDN (`src/assets/fonts/*.woff2`, `src/fonts.css`): `Literata` (Display/Serif), `Be Vietnam Pro` (UI/Sans), `JetBrains Mono` (Mono); giữ `.woff2` ngoài CSS bằng `assetsInlineLimit`.
  - Vá lệch đo tiêu đề Canvas (`M-04`), chủ động nạp font Canvas (`useReaderCanvasFontVersion`), chuẩn hoá NFC + ảnh hoa/thường EPUB/DOCX + chặn link `.xhtml` nội bộ văng khỏi SPA.
  - 4 chế độ nền (`Ban ngày` · `Giữa trưa` · `Chiều tối` · `Đêm khuya`) cho App 2D + Trình đọc (Cách 1: **0 dòng sửa trong `src/components/library3d/`**) + vá triệt để lỗi `B1` giữ màu nền đọc qua F5/mở sách/chuyển tập.
- Đang chuyển sang **Phase 4** (2 commit nhỏ: 4a Auth/Reader/Lightbox/Guest Stream, 4b Store/Modals/UX/A11y) và **Phase 5** (3D fixes, `DECISIONS.md`, `ARCHITECTURE.md`, kiểm định thực tế).

## Bước tiếp theo
1. Thực hiện Phase 4a (Auth, Reader, Lightbox, Guest Stream) và Phase 4b (Store, Modals, Parsers, UX/A11y).
2. Thực hiện Phase 5 (3D fixes, `DECISIONS.md` `D-033`/`D-034`, `ARCHITECTURE.md`, kiểm định thực tế trình duyệt & Worker).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 3:** Font tiếng Việt tự lưu trữ 0 CDN + NFC/link EPUB + 4 chế độ nền App 2D & Reader (giữ nguyên 3D) + sửa lỗi B1.
- **Phase 2:** Bảo mật & hiệu năng Cloudflare Worker + D1/R2.
