# HANDOFF
Cập nhật: 2026-11-21 19:19 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.77 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa sửa dứt điểm lỗi nền trong suốt HUD/Dropdown do opacity ngoài thang Tailwind v3 `/92`/`/98`/`/12` → đang chờ chốt có dùng `battle_boss.glb` hay giữ `boss-arena.glb` cho Phòng Boss)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Hoàn tất trọn Sub-phase 4A-T4 (PA-3: giữ 4 tầng mặc định cho PR 4A, UI/Minimap sẵn sàng 10–100+ tầng & mọi cỡ map — XANH 100%):**
  - **`MinimapWidget.tsx`:** minimap radar tròn HiDPI tự co giãn theo `floor.bounds` (hỗ trợ Phòng Boss 360° + tự bám Kirito với bản đồ `> 76 m`), vẽ Kirito + vùng nhìn 360°, tủ sách xoay, trạm tương tác, Cửa Phòng Boss, Cổng tầng và vị trí live của NPC (Asuna đang đi dạo), kèm bảng chú thích thu gọn và dừng RAF hoàn toàn khi paused/ẩn tab/reduced-motion.
  - **`CozyGameHud.tsx` + `WorldQuickBar.tsx` + `Library3DOverlay.tsx`:** HUD gọn thoáng góc màn hình (`<= z-20`, vùng giữa `pointer-events-none`), bộ chọn tầng dạng dropdown/popover chịu được 10–100+ tầng (tự hiện ô lọc khi `> 6` tầng), tìm sách xuyên tầng nhảy thẳng tới cuốn sách (`findJumpTargetForBook`), thanh `LV / HP / MP / XP` tính từ tiến độ đọc (`computeReaderRpgStats`) + mục tiêu mở khoá Phòng Boss thu gọn được, nút bật/tắt âm thanh môi trường, giữ nguyên `Thứ 3 / Thứ 1 (V)` và `BookInspectCard`.
  - **`ambientAudio.ts`:** âm thanh môi trường Web Audio API thuần nội bộ (0 file ngoài, 0 CDN) theo `4 Biome × 3 Theme` + `Phòng Boss` kèm bước chân nhẹ; mặc định TẮT cho tới thao tác bật, tự suspend khi đọc sách/mở modal/ẩn tab và gọi `AudioContext.close()` sạch khi unmount.
  - **`InteractiveStations.tsx`:** vòng sáng rune ma thuật 3D dịu dưới chân toàn bộ trạm tương tác (`Bàn đọc`, `Bục Thủ thư`, `Trụ Thời tiết`, `Cổng tầng`, `Cửa Phòng Boss`, `Cửa rời Phòng Boss`) tự nổi sáng & dâng màn sáng nhẹ khi Kirito lại gần trong tầm `[E]`, hỗ trợ click trực tiếp và `dispose()` sạch GPU.
  - Kiểm định: `npm run typecheck`, `npm run lint` (0 lỗi, 0 cảnh báo, mọi file `<= 500` dòng hiệu dụng), `npm run build` (`index-*.js` `84.77 kB gzip`, `0 B three`, `0 CDN`), 5/5 unit test 4A-T4 (RPG stats, audio profiles/lifecycle, 4/10/100 floors & Boss Room).

## Bước tiếp theo
1. Người dùng chạy `npm run dev` kiểm tra trực quan Sub-phase 4A-T4: Minimap live (kể cả trong Phòng Boss 360°), Dropdown chọn tầng, Cozy HUD (`LV/HP/MP/XP` + mục tiêu Boss thu gọn), bật/tắt âm thanh môi trường + bước chân, vòng sáng rune trạm tương tác sáng lên khi tới gần tầm `[E]`.
2. **Sub-phase 4A-T5:** rà toàn bộ checklist mục 4 trong `docs/plans/phase-4-aincrad-tower.md` (desktop `>= 1024px`, mobile `< 1024px`, 5 modal, 0 FPS khi đọc sách/ẩn tab) → mở Pull Request `feat/library-3d` → `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Sub-phase 4A-T4 (`feat/library-3d`):** `MinimapWidget.tsx`, `CozyGameHud.tsx`, `ambientAudio.ts`, `InteractiveStations.tsx`, nâng cấp `WorldQuickBar.tsx`, `Library3DOverlay.tsx`, `LibraryCanvas.tsx`, `PlayerRig.tsx`, `FantasyLibrary3D.tsx`.
- **Lọc bỏ sách đã hoàn thành khỏi "Tiếp tục đọc" (`feat/library-3d`):** `selectContinueReadingBooks` trong `src/hooks/useLibraryViewState.ts`.
- **12 Real PBR `.glb` Nội thất đa dạng theo tầng & sửa cầu thang Tầng 2/3 (`feat/library-3d`, D-023):** `WorldFurnitureGlbs.tsx`, `GrandLibraryHallMesh.tsx`, `prop-mossy-stairs.glb`, `pbr-wood-albedo.webp`.
