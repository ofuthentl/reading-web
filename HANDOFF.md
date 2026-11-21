# HANDOFF
Cập nhật: 2026-11-21 13:52 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.55 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa hoàn tất **Phương án 1 — Dàn NPC anime, Boss phòng Boss 3 tầng & đạo cụ/PBR thật `D-020`**, tạm dừng sạch chờ kiểm tra trực quan → `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/library-series-tab.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Phương án 1 (`D-020`) — Đồng bộ toàn bộ NPC anime `.glb`, Boss theo tầng & đạo cụ/PBR thật (0 CDN) hoàn tất & XANH 100%:**
  - **6 NPC anime `.glb` (`AmbientNpcs.tsx`):** thay sạch NPC hộp cũ bằng `npc-yui.glb` (111 KB, bay lơ lửng sau Bục Thủ thư), `npc-asuna.glb` (179 KB), `npc-maid.glb` (571 KB, tự ẩn tấm sàn Showcase `Object_4`), `npc-zhongli.glb` (417 KB), `npc-schoolgirl.glb` (336 KB), `npc-mint.glb` (3.39 MB, chạy clip 24s `char_mint_stand_show_1`). Tất cả đã gỡ `KHR_materials_unlit` sang PBR bắt sáng & bóng đổ tự nhiên.
  - **Boss 3D đứng trong Phòng Boss từng tầng (`WorldGlbActors.tsx`):** Tầng 2 (`boss-monster.glb` 6.41 MB, clip `MOTION`), Tầng 3 (`stone-golem.glb` 950 KB, clip `Idle`), Tầng 4 (**`boss-stormterror.glb`** 752 KB, đứng uy nghi trong Phòng Boss Đảo Phế tích, không lượn trên trời).
  - **Đạo cụ & Texture PBR thật:** thêm `prop-vines.glb` (577 KB) & `prop-mossy-stairs.glb` (597 KB) cho Tầng 2 & 4; trích 3 texture 1024px WebP PBR đá lát ẩm thật (`public/textures/pbr-cobble-*.webp`, 305 KB) nối vào `worldMaterials.ts` kèm `dispose()` an toàn.
  - **Đã gọn UI 2D & 3D:** bỏ thanh tìm/lọc kệ chắn tầm nhìn ở 3D (`Library3DOverlay.tsx`) và bỏ chips lọc kệ trùng ở tab 2D `Trang chủ` (`Library2DView.tsx`).

## Bước tiếp theo
1. Khi quay lại: chạy `npm run dev` kiểm tra trực quan dàn NPC anime 4 tầng, Boss 3 tầng (đặc biệt Stormterror trong Phòng Boss Tầng 4), dây leo & mặt đá PBR ẩm.
2. **Sub-phase 4A-T4**: `MinimapWidget.tsx`, `CozyGameHud.tsx` (HP/Mana/XP nền + Nhiệm vụ đọc thu gọn), `ambientAudio.ts` (âm thanh môi trường Web Audio API), `InteractiveStations.tsx` (vòng sáng trạm tương tác 3D).
3. **Sub-phase 4A-T5**: kiểm thử toàn bộ checklist PR 4A → mở PR merge vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Dàn NPC anime, Boss phòng Boss 3 tầng & đạo cụ/PBR thật (`feat/library-3d`, D-020):** nén 10 `.glb` + 3 texture PBR WebP (0 lỗi UV/normal/unlit), tách `WorldGlbActors.tsx`, thay mới `AmbientNpcs.tsx` & nối `worldMaterials.ts`.
- **Gọn HUD 3D & 2D, sửa Idle Kirito & gắn đèn rọi kệ sách (`feat/library-3d`, D-019):** `player.glb` dáng đứng thẳng tự nhiên, đèn đồng rọi ấm mọi kệ sách, `town-world.glb` Tầng 1, IBL `PMREMGenerator` 0 CDN.
