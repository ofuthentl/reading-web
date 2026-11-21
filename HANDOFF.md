# HANDOFF
Cập nhật: 2026-11-21 16:33 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.55 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa hoàn tất **PA-A: nâng cấp 9 model PBR `.glb` thật từ `glb/item/` thay sạch vật dụng nhựa, sửa cầu thang Tầng 2 & bịt kín Đại Thư Viện Tầng 3 `D-023`** → chờ kiểm tra trực quan, tiếp sang `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/real-glb-furniture-and-grand-library.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Hoàn tất trọn Phase 1 → Phase 4 của `real-glb-furniture-and-grand-library.md` (`D-023`, XANH 100%):**
  - **9 asset `.glb` PBR thật nén WebP 1024 + Meshopt (tổng chỉ `4.08 MB`, 0 CDN):** `prop-bookcase-victorian.glb` (315 KB), `prop-library-table.glb` (222 KB), `prop-library-chair.glb` (320 KB), `prop-dragon-door.glb` (674 KB, `metalrough` + simplify), `prop-library-stairs.glb` (441 KB), `prop-spiral-stairs.glb` (470 KB), `prop-book-pile.glb` (793 KB), `prop-stone-well.glb` (438 KB), `prop-stone-platform.glb` (415 KB).
  - **Thay sạch đồ nội thất hộp trên cả 4 tầng (`WorldFurnitureGlbs.tsx`, `BiomePropsMesh.tsx`):** mọi Bàn đọc / Bục Thủ thư dùng `prop-library-table.glb` + chồng sách cổ `prop-book-pile.glb`; mọi ghế băng hộp thành đôi ghế gỗ `prop-library-chair.glb`; mọi Cửa Phòng Boss thành **Cửa Đá Rồng Chạm Khắc (`prop-dragon-door.glb`)** kèm đôi đài đuốc & ấn phong ấn xoay; bổ sung giếng đá cổ Tầng 2 (`prop-stone-well.glb`) & bệ đá cổ đỉnh đền/Đài Boss (`prop-stone-platform.glb`).
  - **Sửa dứt điểm cầu thang Tầng 2 & Đại Thư Viện Tầng 3 (`worldGeometryBuilder.ts`, `grandLibraryBuilder.ts`, `GrandLibraryHallMesh.tsx`, `proceduralMaterials.ts`):** kéo lùi khối cỏ đỉnh đồi Tầng 2 (`Z = -29.5`) hết cắt ngang `mountain-stairs.glb`; bịt kín 100% 4 bức tường Tầng 3 không còn lỗ hổng/chéo góc, ốp kín 2 tầng tủ Victorian PBR thật (`prop-bookcase-victorian.glb`), thay cầu thang kính nhấp nháy bằng cầu thang gỗ/đá thật `prop-library-stairs.glb` khớp vật lý + đôi cầu thang xoắn ốc `prop-spiral-stairs.glb` lên tầng lửng + 4 góc bàn đọc/ghế/chồng sách thật; dịu toàn bộ đồng cổ & gỗ lì hết vẻ nhựa bóng.
  - Kiểm định: `typecheck`, `lint` (0/0), `build` (`84.55 kB gzip`, `0 B three`, `0 CDN`), 21/21 test 4A-T1 & 6/6 test 4A-T2.

## Bước tiếp theo
1. Người dùng chạy `npm run dev` kiểm tra trực quan: cầu thang Tầng 2 hết cỏ cắt, Đại Thư Viện Tầng 3 kín 4 vách với tủ Victorian + cầu thang thật + cầu thang xoắn, Cửa Rồng Boss + bàn ghế/chồng sách cổ thật trên cả 4 tầng.
2. **Sub-phase 4A-T4**: `MinimapWidget.tsx`, `CozyGameHud.tsx` (HP/Mana/XP nền + Nhiệm vụ đọc thu gọn), `ambientAudio.ts` (âm thanh môi trường Web Audio API), `InteractiveStations.tsx` (vòng sáng trạm tương tác 3D).
3. **Sub-phase 4A-T5**: kiểm thử toàn bộ checklist PR 4A → mở PR merge vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **9 Real PBR `.glb` Nội thất + Đại Thư Viện Tầng 3 & Sửa cầu thang Tầng 2 (`feat/library-3d`, D-023):** `WorldFurnitureGlbs.tsx`, `prop-bookcase-victorian`, `prop-library-table`, `prop-library-chair`, `prop-dragon-door`, `prop-library-stairs`, `prop-spiral-stairs`, `prop-book-pile`, `prop-stone-well`, `prop-stone-platform`.
- **Background 360° Aincrad & Phòng Boss 360° (`feat/library-3d`, D-021/D-022):** `skyPanoramaPainter.ts` 2K, `WorldHorizonVista.tsx`, `BossArenaMesh.tsx`, `npc-asuna.glb` (`Idle`+`Walk`).
