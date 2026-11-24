# HANDOFF
Cập nhật: 2026-11-24 19:40 | Nhánh: refactor/remove-library-3d | Build: 🟢 typecheck / lint / build (83.85 kB gzip) xanh
Nhiệm vụ hiện tại: **Đã gỡ bỏ hoàn toàn chức năng & tài sản Thư viện 3D (`D-040`) — sẵn sàng mở PR vào `main` và chuyển sang bước vá lỗi 2D/Worker hoặc nâng cấp v4**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/remove-library-3d.md

## Đang làm dở
- Không có việc làm dở trên nhánh `refactor/remove-library-3d`.

## Xong trong nhánh này
1. **Gỡ mã nguồn & cầu nối 3D (`D-040`):** xoá toàn bộ `src/components/library3d/` (42 tệp), `Library3DHost.tsx`, `ViewModeToggle.tsx`, `useCanUse3D.ts`; dọn sạch props/type/cầu nối 3D tại `App.tsx`, `LibraryHeader.tsx`, `Library2DView.tsx`, `Library2DDialogsHost.tsx`, `CommandPaletteModal.tsx`, `useShelfDeepLink.ts`, `useTheme.ts`, `types.ts` và `public/sw.js`.
2. **Xoá toàn bộ tài sản 3D & gói npm:** xoá `public/models/` (27 `.glb`, ~`39.4 MB`), `public/textures/` (10 `.webp` PBR, ~`1.36 MB`), thư mục nguồn cục bộ `glb/` (55 tệp, ~`1.43 GB` & bỏ khỏi `.gitignore`), và gỡ `three`, `@react-three/fiber`, `@types/three` (giảm 22 gói npm, bỏ chunk `FantasyLibrary3D` ~`1.1 MB`, giảm entry từ `85.39 kB` xuống `83.85 kB` gzip).
3. **Bảo toàn 100% tính năng 2D & Kiểm thử:** giữ nguyên `public/sounds/*.m4a`, con trỏ Miku 2D, `readingStats.ts`, Backend Worker và thư mục `docs/`; đã xác nhận `0` tham chiếu 3D qua `git grep`, build sạch 0 cảnh báo và kiểm thử trực quan 2D (Header, 4 theme, `Ctrl+K`, 3 tab, 0 lỗi Console/404).

## Bước tiếp theo
1. Push nhánh `refactor/remove-library-3d` và mở Pull Request vào `main` để GitHub Actions deploy bản 2D tinh gọn lên `ofu.lol`.
2. Nếu người dùng muốn tiếp tục: tạo nhánh `fix/...` vá nhóm lỗi High/Medium tồn đọng của 2D Reader v3 & Worker (chống cào `rl_strikes`, `reading_seconds`, Furigana `justify`/Highlight, kéo đáy Guest, che spoiler Bình luận v2, nhạc nền iOS Safari `'interrupted'`, Wrapped PNG) hoặc lập kế hoạch tính năng v4.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc ngoài Git.
