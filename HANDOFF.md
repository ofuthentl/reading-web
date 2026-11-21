# HANDOFF
Cập nhật: 2026-11-21 17:38 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.55 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa hoàn tất **Đa dạng hoá nội thất PBR `.glb` theo từng tầng/vị trí: 12 asset thật + biến thể bàn trà Nhật/bàn đá cổ/ghế bành nhung & vân gỗ ảnh thật `pbr-wood-albedo.webp` `D-023`** → chờ kiểm tra trực quan, tiếp sang `Sub-phase 4A-T4`)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/real-glb-furniture-and-grand-library.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Hoàn tất trọn bộ nâng cấp 12 Real PBR `.glb` đa dạng theo vị trí + sửa cầu thang Tầng 2/3 (`D-023`, XANH 100%):**
  - **12 asset `.glb` thật nén WebP 1024 + Meshopt (tổng `5.3 MB`, 0 CDN):** `prop-bookcase-victorian`, `prop-library-table`, `prop-wooden-table` (`wooden-table-02`), `prop-artisan-table` (chuyển từ `Tabel.rar`), `prop-library-chair`, `prop-armchair` (`modern-arm-chair-01`), `prop-dragon-door`, `prop-library-stairs`, `prop-spiral-stairs`, `prop-book-pile`, `prop-stone-well`, `prop-stone-platform` + ảnh vân gỗ liền mạch thật `public/textures/pbr-wood-albedo.webp` nâng cấp toàn bộ tủ sách người dùng.
  - **Phân bổ đa dạng theo từng tầng/vai trò (`furnitureGlbHelpers.ts`, `WorldFurnitureGlbs.tsx`, `GrandLibraryHallMesh.tsx`) — KHÔNG lặp 1 mẫu:**
    - **Tầng 1:** Bàn sồi phố `prop-wooden-table` + ghế gỗ & ghế bành kem `prop-armchair`; Bục Thủ thư dùng `prop-artisan-table` + tủ thấp Victorian Archive (`Small`).
    - **Tầng 2:** Bàn trà Nhật trầm thấp (`0.58 m` từ `wooden-table`) + đôi ghế trầm; Hiên Thủ thư dùng `artisan-table` gỗ đỏ + giếng đá cổ `prop-stone-well` & bệ đá đỉnh đền; thay cầu thang đá lệch tảng đá bằng **2 nhịp cầu thang đá rêu phẳng đối xứng (`prop-mossy-stairs.glb`, 8 bậc khít 100% dốc vật lý, 0 khe hở đỉnh & 0 xuyên đá)** cho cả Tầng 2 và Tầng 4.
    - **Tầng 3 (Đại Thư Viện kín 4 vách):** 2 tầng tủ Victorian thật + cầu thang `prop-library-stairs` + đôi cầu thang xoắn `prop-spiral-stairs`; Bàn giữa `library-table`, Quầy Thủ thư `artisan-table` + tủ Victorian + ghế bành đỏ đô; 4 góc đọc & sảnh Đông phối riêng biệt (2 góc lounge ghế bành nhung đỏ đô/ngọc lục bảo + 2 góc học bàn cổ/artisan).
    - **Tầng 4:** Bàn Đá Ánh Sao & Đài Thủ thư Cổ đại dựng từ khối đá chạm `prop-stone-platform` + chồng sách & ánh sao dịu; mọi Cửa Boss đều là **Cửa Đá Rồng (`prop-dragon-door`)** kèm đôi đài đuốc.
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
