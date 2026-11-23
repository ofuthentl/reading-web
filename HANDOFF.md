# HANDOFF
Cập nhật: 2026-11-23 14:00 | Nhánh: fix/audit-bugs-drop-pdf-and-fonts | Build: 🟢 frontend (`84.54 kB` gzip) · 🟢 ESLint 0/0 · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Vá lỗi tồn đọng toàn diện, gỡ bỏ PDF (`D-033`), 4 chế độ nền App 2D + Reader & font tiếng Việt tự lưu trữ (`docs/plans/audit-fixes-drop-pdf-and-fonts.md`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- **Phase 1 (Xong):** Gỡ bỏ hoàn toàn PDF (FE + Worker + `migrations/0008_drop_pdf.sql`) và `@react-three/drei`.
- **Phase 2 (Xong):** Vá toàn bộ bảo mật, tính toàn vẹn & hiệu năng Backend Worker (`rateLimitDb.ts`, `bookUploadRoutes.ts`, `guestPack.ts`, `guestSearch.ts`, `forensicWatermark.ts`, `discord.ts`, `shelfAccessDb.ts`, `progressDb.ts`, `auth.ts`, `bookmarksDb.ts`, `shelfTagsDb.ts`, `booksDb.ts`, `r2Files.ts`, `index.ts`, `schema.sql`, `migrations/0009_perf_indexes.sql`).
- Đang chuyển sang **Phase 3**:
  - Font tiếng Việt tự lưu trữ 0 CDN (`Literata`, `Be Vietnam Pro`, `JetBrains Mono`) + sửa lệch tiêu đề Canvas (`M-04`) + nạp lại layout khi `document.fonts` xong.
  - Chuẩn hoá `.normalize('NFC')` khi parse EPUB/DOCX + fallback ảnh hoa/thường + chặn link `.xhtml` nội bộ văng khỏi SPA.
  - 4 chế độ nền (`Ban ngày` · `Giữa trưa` · `Chiều tối` · `Đêm khuya`) cho App 2D + Reader theo **Cách 1** (giữ nguyên 100% 3D) + sửa lỗi `B1`.

## Bước tiếp theo
1. Thực hiện Phase 3 (font `.woff2` cục bộ, NFC/link EPUB, 4 chế độ nền App 2D & Reader + sửa B1), verify build/lint/typecheck và commit.
2. Tiếp tục Phase 4 (Frontend fixes) và Phase 5 (3D fixes, `DECISIONS.md`, `ARCHITECTURE.md`, kiểm định thực tế).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 2:** Vá atomic Token Bucket (`H-1`), giới hạn scan/quota tìm kiếm (`H-2`), Forensic Watermark NFC + tách đoạn (`H-3`), Discord replay window 5 phút (`H-4`), đổi tên kệ 2 pha chống lộ quyền (`H-5`), brute-force login theo IP (`M-8`), upload/R2/D1 atomicity & indexes (`M-1..M-9`, `L-1..L-5`).
- **Phase 1:** Gỡ hoàn toàn PDF & `@react-three/drei`.
