# HANDOFF
Cập nhật: 2026-11-21 15:36 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.55 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa hoàn tất **Gỡ Yui lỗi váy + Background 360° Aincrad Sky 2K & biển mây/đảo bay + Đại Thư Viện Hoàng Gia 2 tầng Tầng 3 `D-022`** → chờ kiểm tra trực quan, tiếp sang `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/horizon-vista-and-grand-library.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Hoàn tất trọn Phase 1 → Phase 4 của `horizon-vista-and-grand-library.md` (`D-022`, XANH 100%):**
  - **Gỡ Yui lỗi váy (`public/models/npc-yui.glb` đã xoá):** giữ dàn 5 NPC chuẩn không lỗi (`Asuna` đi dạo + `Idle` Mixamo, `Zhongli` & `Silica/SchoolGirl` thở/đảo đầu theo xương thật, `Mint` clip 24s, `Maid` dáng tự nhiên).
  - **Background 360° không gian bên ngoài (`skyPanoramaPainter.ts` 2048×1024 + `WorldHorizonVista.tsx`):** bầu trời 2K có Dải Ngân Hà, cực quang, Mặt Trăng/Mặt Trời & mây anime; vành đai 3D 360° gồm **biển mây 2 tầng trôi chậm dưới chân đảo**, dãy núi chập chùng (Tầng 2 có đỉnh Phú Sĩ + tháp chùa xa), quần đảo bay Aincrad + tàn tích pha lê & vành đế tầng trên khổng lồ của Aincrad; sửa hạt đom đóm/bụi sao sắc nét với `AdditiveBlending` (hết cục vuông trắng mờ).
  - **Đại Thư Viện Hoàng Gia Tầng 3 (`GrandLibraryHallMesh.tsx`):** 2 tầng kệ tường gỗ óc chó kín **6.000+ sách da cổ điển `InstancedMesh`**, ban công tầng lửng lan can đồng + thang thư viện, cửa sổ vòm kính màu + cửa hoa hồng, mái vòm cong đồng 7 nhịp mở trần kính sao, thảm đỏ viền vàng hoàng gia, 4 đèn chùm đồng 2 tầng phát sáng ấm & 4 bàn học đèn xanh lục bảo — ra trọn chất Đại Thư Viện ngay cả khi Tầng 3 có 0 sách người dùng.
  - Kiểm định: `typecheck`, `lint` (0/0), `build` (`84.55 kB gzip`, `0 B three`, `0 CDN`), 21/21 test 4A-T1 & 6/6 test 4A-T2.

## Bước tiếp theo
1. Người dùng chạy `npm run dev` kiểm tra trực quan: Đại Thư Viện Hoàng Gia 2 tầng Tầng 3, khung cảnh 360° biển mây / đảo bay / bầu trời 2K ở Tầng 2 & Tầng 4, hạt đom đóm sắc nét & dàn 5 NPC (Asuna đi dạo, không còn Yui).
2. **Sub-phase 4A-T4**: `MinimapWidget.tsx`, `CozyGameHud.tsx` (HP/Mana/XP nền + Nhiệm vụ đọc thu gọn), `ambientAudio.ts` (âm thanh môi trường Web Audio API), `InteractiveStations.tsx` (vòng sáng trạm tương tác 3D).
3. **Sub-phase 4A-T5**: kiểm thử toàn bộ checklist PR 4A → mở PR merge vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Background 360° Aincrad & Đại Thư Viện Hoàng Gia Tầng 3 (`feat/library-3d`, D-022):** `skyPanoramaPainter.ts` 2K, `WorldHorizonVista.tsx`, `GrandLibraryHallMesh.tsx`, hạt đom đóm sắc nét, gỡ `npc-yui.glb`.
- **Phòng Boss kín 360° & Mixamo Asuna (`feat/library-3d`, D-021):** `bossRoomLayout3d.ts`, `BossArenaMesh.tsx`, `npc-asuna.glb` (`Idle`+`Walk`), `prop-torii-gate.glb`, 6 ảnh PBR `pbr-tile`/`pbr-stone`.
