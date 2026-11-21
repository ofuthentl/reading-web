# HANDOFF
Cập nhật: 2026-11-21 21:48 | Nhánh: fix/post-4a-cleanup | Build: 🟢 frontend (entry <= 86.04 kB gzip, 0 B three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất Bước 0 — Vá lỗi tồn đọng hậu PR 4A (`fix/post-4a-cleanup`)**, sẵn sàng push & mở PR vào `main` trước khi bắt đầu PR 4B (`BookSpreadReader`).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/fix-post-4a-cleanup.md

## Đang làm dở
- Đã hoàn tất trọn gói bản vá Bước 0 trên nhánh `fix/post-4a-cleanup`:
  1. Bổ sung `library_sample/`, `*.mp4`, `/image.png` vào `.gitignore` chống commit nhầm tệp mẫu cục bộ; đồng bộ ref `main` cục bộ theo `origin/main`.
  2. `src/App.tsx`: truyền `paused` khi mở bất kỳ modal nào (`0 FPS`, ngưng âm thanh môi trường, ẩn HUD, khoá phím `WASD`/`V`/`E` sau modal) và giữ sống `<Library3DHost paused dimmed />` ở nền khi mở đọc sách trong 3D → đóng sách quay lại đúng vị trí/tầng của Kirito tức thì (`0 ms`), không phải giải mã lại `13 MB+` GLB.
  3. Xoá dead asset `public/models/mountain-stairs.glb` (`321 KB`) cùng dead code `MountainStairsGlb` / `createShelfNameplateTexture` sau `D-023` (còn 27 `.glb` thực dùng 100%).
  4. Kích hoạt `requestRender` ngay khi các bộ texture PBR (`pbr-wood-albedo`, `pbr-cobble`, `pbr-tile`, `pbr-stone`) tải xong bất đồng bộ ở chế độ `prefers-reduced-motion` (`frameloop="demand"`).
  5. Đồng bộ `docs/ARCHITECTURE.md` và `docs/plans/phase-4-aincrad-tower.md` phản ánh PR #5 (`feat/library-3d`) đã merge vào `main`.

## Bước tiếp theo
1. Mở Pull Request `fix/post-4a-cleanup` → `main` trên GitHub, chờ cả 2 job CI (`frontend` + `worker`) xanh → merge vào `main` (tự deploy lên `https://ofu.lol`).
2. Sau khi merge Bước 0: chuyển sang nhánh `feat/book-spread-reader` (tách mới từ `origin/main`), đọc mã nguồn `MengTo/sketchbook` để cập nhật kế hoạch `docs/plans/phase-4b-book-spread-reader.md`, chờ duyệt rồi triển khai **PR 4B** (`BookSpreadReader` 2 trang + mở bìa + lật trang).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Bước 0 (`fix/post-4a-cleanup`):** vá `paused`/giữ nền 3D khi mở sách & modal, dọn `mountain-stairs.glb` thừa, nối `requestRender` PBR cho `demand`, cập nhật `.gitignore` & tài liệu.
- **PR #5 (`feat/library-3d`):** merge Aincrad Reading Tower (PR 4A) vào `main` & deploy lên `https://ofu.lol`.
