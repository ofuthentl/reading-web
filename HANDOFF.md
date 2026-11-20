# HANDOFF
Cập nhật: 2026-11-21 02:51 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 275.72 kB / 81.04 kB gzip) · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Rebase `feat/library-3d` lên `origin/main` (sau PR #4 `D-009`), chuẩn bị chốt `D-010` → `D-014` và triển khai Sub-phase 4A.1
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-3d.md

## Đang làm dở
- Nhánh `feat/library-3d` đã rebase sạch lên `origin/main` (gồm PR #4 `feat/docx-drop-mobi-cbz`: chỉ còn 3 định dạng `epub`, `pdf`, `docx`).
- Chuẩn bị cập nhật `docs/DECISIONS.md` (`D-010` → `D-014`), hiệu chỉnh `docs/plans/phase-4-3d.md` theo `D-009` + 3 chốt kỹ thuật, rồi triển khai Sub-phase 4A.1.

## Bước tiếp theo
1. Ghi `D-010` → `D-014` vào `docs/DECISIONS.md` và cập nhật `docs/plans/phase-4-3d.md`.
2. Triển khai Sub-phase 4A.1 (`useCanUse3D`, `useLibraryViewState`, `ViewModeToggle`, `Library3DHost`, vỏ tạm `FantasyLibrary3D`, nối `LibraryHeader`, `Library2DView`, `App.tsx`).
3. Kiểm định sạch `typecheck`, `lint`, `build`, cập nhật `HANDOFF.md` & `docs/ARCHITECTURE.md` và báo người dùng test nhanh 4A.1.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Rebase `feat/library-3d` lên `origin/main`:** nhận trọn bộ PR #4 (`D-009`: bỏ MOBI/CBZ, thêm DOCX, baseline entry `275.72 kB / 81.04 kB gzip`).
- **PR #4 (`feat/docx-drop-mobi-cbz`):** đã merge vào `origin/main` và deploy lên `ofu.lol`.
