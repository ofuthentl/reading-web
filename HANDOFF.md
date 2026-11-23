# HANDOFF
Cập nhật: 2026-11-23 14:55 | Nhánh: fix/audit-bugs-drop-pdf-and-fonts | Build: 🟢 typecheck · 🟢 ESLint 0/0 · 🟢 build (`85.52 kB` gzip) · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Hoàn tất 5/5 Phase kế hoạch `docs/plans/audit-fixes-drop-pdf-and-fonts.md`** (vá lỗi tồn đọng toàn diện, gỡ PDF `D-033`, font tiếng Việt cục bộ 0 CDN + 4 chế độ nền App 2D/Reader giữ nguyên 3D `D-034`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Toàn bộ 5 Phase đã triển khai, kiểm định tĩnh và chạy thử thực tế (Worker local D1/R2 + Trình duyệt PC `1280×800`, Mobile dọc `390×844` & xoay ngang `844×390`) ĐẠT 100%, sẵn sàng đẩy nhánh & tạo Pull Request vào `main`.

## Bước tiếp theo (Triển khai Production — chờ người dùng thực hiện)
1. **Chạy 2 migration D1 lên production** *(chạy trước khi deploy Worker nếu đang còn sách PDF cũ)*:
   - `cd workers/r2-storage`
   - `npx wrangler d1 execute library-db --remote --file=./migrations/0008_drop_pdf.sql`
   - `npx wrangler d1 execute library-db --remote --file=./migrations/0009_perf_indexes.sql`
2. **Deploy Cloudflare Worker:** `cd workers/r2-storage && npm run deploy`
3. **Push nhánh & mở Pull Request vào `main`:** `git push -u origin fix/audit-bugs-drop-pdf-and-fonts` rồi merge PR khi CI xanh để auto-deploy `ofu.lol`.
4. *(Tuỳ chọn sau khi kiểm tra)* Dọn các tệp PDF cũ mồ côi trên R2 bucket nếu trước đó đã từng tải PDF lên production.

## Lỗi / chặn
- Không có lỗi/chặn nào. Trong quá trình kiểm định thực tế đã phát hiện & vá thêm 2 lỗi tinh vi: R2 bỏ qua `Range` vượt biên trả `206` thay vì `416` (`r2Files.ts`) và phím `Enter` ở ô nhập Discord ID trong `ShelfAccessModal` vẫn kích hoạt submit ngầm (đã gỡ vỏ `<form>`).

## Xong gần nhất
- **Phase 1–2:** Gỡ hoàn toàn PDF + `@react-three/drei` (`D-033`); vá toàn bộ Backend Worker (`rateLimitDb.ts`, `bookUploadRoutes.ts`, `H-1`–`H-5`, `M-1`–`M-9`, `L-1`–`L-5`, `migrations/0008–0009`).
- **Phase 3–4:** 39 tệp `.woff2` tiếng Việt tự lưu trữ 0 CDN (`Literata`, `Be Vietnam Pro`, `JetBrains Mono`) cho DOM + Canvas (`useReaderCanvasFontVersion`); 4 nền App 2D/Reader (`Ban ngày` trắng `#fcfbf8` · `Giữa trưa` kem ấm `#f6f1e7`/`#f4ecd8` · `Chiều tối` `#0d1117` · `Đêm khuya` `#060608`) giữ nguyên 100% 3D (`D-034`); vá `B1`, Auth, Reader, Lightbox, Store rollback, Modals & UX/A11y.
- **Phase 5 & Kiểm định:** Vá 3D (`gltfLoader`, StrictMode `LibraryCanvas`/`InteractiveStations`, `Escape` `bossSealNotice`, Miku cursor, lazy fallback `KiritoAvatar`, gỡ `buildLibraryLayout3D`, timer `WorldQuickBar`); đồng bộ `DECISIONS.md` (`D-033`, `D-034`) & `ARCHITECTURE.md`; kiểm định thực tế 11/11 test Worker + 5/5 test Trình duyệt XANH (0 console error, 0 CDN ngoài).
