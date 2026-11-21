# HANDOFF
Cập nhật: 2026-11-21 11:52 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.70 kB gzip, 0 B three) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (`Sub-phase 4A-T3` xong, đã test được trực tiếp trên web → chuẩn bị `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/library-series-tab.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Sub-phase 4A-T3 hoàn tất & kiểm định XANH 100% (đã chạy thử trực tiếp được trên web qua `npm run dev`):**
  - `KiritoAvatar.tsx` (390 dòng): Black Swordsman đúng ảnh mẫu `image.png` (tóc mái nhọn phân lớp, mặt anime Canvas2D, áo khoác cổ cao viền bạc + 2 tà áo bay theo tốc độ, dây chéo + khoá 3 chấu, huy hiệu vai trái, bốt cổ xám, kiếm Elucidator đeo sau vai phải), ẩn khi `firstPerson`, có cổng `customModelUrl`.
  - `AmbientNpcs.tsx` (268 dòng): NPC Thủ thư / Độc giả ngồi / Người đi dạo theo waypoint sạch va chạm, tự quay nhìn Kirito, cập nhật `npcPositionsRef` live.
  - `PlayerRig.tsx` (381 dòng): `WASD` + `Shift`, kéo chuột xoay 360° (ngưỡng 5px tách drag/click), zoom, `V` Thứ 3 ↔ Thứ 1, `E` tương tác Cổng/Trạm/NPC, vật lý `worldPhysics3d.ts`.
  - Xử lý trọn vẹn 3 điểm lưu ý: `LibraryCanvas.tsx` chuyển `frameloop` thông minh (`'always'` khi đi dạo, `'demand'` khi giảm chuyển động, **`'never'` = 0 FPS** khi mở sách/modal/ẩn tab), `FantasyLibrary3D.tsx` gọi **`clearLocalGlbCache()`** khi unmount 3D, `BiomePropsMesh.tsx` tự trừ `template.bbox.min[1]` căn sát đất cho cả 3 `.glb`.
  - Gỡ bỏ `CameraRig.tsx` & `LibraryRoomMesh.tsx` cũ; thêm `WorldQuickBar.tsx` (chuyển nhanh Tầng 1..N, nút Thứ 3/1, pill `[E]` & thoại NPC).
  - Kiểm định: 19/19 (4A-T1) + 5/5 (4A-T2, 0 CDN cả `src/` & `dist/`), `typecheck`/`lint`/`build` XANH 100%, mọi file `<= 500` dòng hiệu dụng.

## Bước tiếp theo
1. Người dùng chạy `npm run dev` kiểm tra trực quan 4 tầng Biome (độ khít `mountain-stairs.glb`, chân `dragon-mascot.glb` & `stone-golem.glb`, hướng bìa vòng cung Starfield, Kirito & NPC).
2. **Sub-phase 4A-T4**: `MinimapWidget.tsx`, `CozyGameHud.tsx` (HP/Mana/XP nền + Nhiệm vụ đọc thu gọn), `ambientAudio.ts` (âm thanh môi trường Web Audio API), `InteractiveStations.tsx` (hitboxes & vòng sáng trạm tương tác 3D).
3. **Sub-phase 4A-T5**: kiểm thử toàn bộ checklist PR 4A → mở PR merge vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A-T3 (`feat/library-3d`):** dựng Kirito, NPC, `PlayerRig`, nối trọn thế giới 4 Biome vào `LibraryCanvas`/`FantasyLibrary3D`/`Library3DOverlay`, xử lý `frameloop` 0 FPS, `clearLocalGlbCache()`, và tự căn `min.y` cho 3 `.glb`.
- **Tab Thư viện 2D (`feat/library-3d`, D-018):** thêm tab `Trang chủ` | `Thư viện`, bìa Tập 1 (`shelfSummary.ts`), lưới thẻ kệ & trang chi tiết nạp lười (`6.03 kB gzip`).
- **Sub-phase 4A-T1 → 4A-T2 (`feat/library-3d`):** thế giới 4 Biome + vật lý OBB/dốc/cầu + nén 3 GLB vào `public/models/` (1.89 MiB, Meshopt/WebP local).
