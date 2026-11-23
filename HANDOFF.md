# HANDOFF
Cập nhật: 2026-11-23 14:25 | Nhánh: fix/audit-bugs-drop-pdf-and-fonts | Build: 🟢 typecheck · 🟢 ESLint 0/0 · 🟢 build · 🟢 Worker tsc
Nhiệm vụ hiện tại: **Vá lỗi tồn đọng toàn diện, gỡ bỏ PDF (`D-033`), 4 chế độ nền App 2D + Reader & font tiếng Việt tự lưu trữ (`docs/plans/audit-fixes-drop-pdf-and-fonts.md`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- **Phase 1–3 (Xong):** Gỡ PDF & drei; vá Backend Worker + D1/R2; font tiếng Việt cục bộ 0 CDN (`Literata`, `Be Vietnam Pro`, `JetBrains Mono`) + 4 chế độ nền (`Ban ngày` trắng sáng `#fcfbf8` · `Giữa trưa` giấy kem ấm `#f6f1e7`/`#f4ecd8` · `Chiều tối` `#0d1117` · `Đêm khuya` `#060608`) giữ nguyên 100% 3D + sửa B1 & M-04.
- **Phase 4a & 4b (Xong):**
  - **4a:** Auth lifecycle (`H-01`, `H-02`, `H-06`, `L-06`), Trình đọc/Lightbox/Guest stream (`H-04`, `H-09`, `M-05`, `M-09`, `M-10`, `L-04`, `L-05`) & đổi màu đúng `Ban ngày`/`Giữa trưa`.
  - **4b:** Store/Rollback (`H-05`, `M-03`, race guard `loadLibrary`), lọc khách (`M-02`), ổn định form Modal (`M-06`, `M-07`, `M-08`), truyền thẳng `arrayBuffer` & `skipMediaBlobs` cho DOCX (`M-12`), UX/A11y (`L-01`–`L-06`, dọn `formatFilter` thừa, chuyển helper xử lý tác giả kệ sang `shelfSummary.ts`).
- Đang chuyển sang **Phase 5** (vá lỗi 3D nhỏ, cập nhật `DECISIONS.md` + `ARCHITECTURE.md` và kiểm định thực tế).

## Bước tiếp theo
1. Thực hiện Phase 5: vá `gltfLoader.ts`, `LibraryCanvas.tsx`, `FantasyLibrary3D.tsx`, `InteractiveStations.tsx`, `layout3d.ts`, `KiritoAvatar.tsx`, `WorldQuickBar.tsx` (không sửa logic 3D theme); cập nhật `docs/DECISIONS.md` (`D-033`, `D-034`) & `docs/ARCHITECTURE.md`.
2. Kiểm định thực tế Backend Worker & Frontend PC/Mobile trên trình duyệt theo checklist plan.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 4b:** Vá toàn bộ lỗi Store/Rollback, Modal quản trị, DOCX RAM & UX/A11y (`index.js` giữ trong ngân sách `<= 86.04 kB` gzip, ESLint 0/0).
