# Kế hoạch: Gỡ Yui lỗi váy, dựng 360° Horizon Background Aincrad & Đại Thư Viện Hoàng Gia Tầng 3

- **Nhánh:** `feat/library-3d`
- **Ngày lập:** 2026-11-21
- **Phạm vi file dự kiến (~9 file):**
  1. Gỡ Yui lỗi váy: `public/models/npc-yui.glb` (xoá), `src/components/library3d/worldTypes.ts`, `src/components/library3d/AmbientNpcs.tsx`, `src/components/library3d/biomeBlueprints.ts`.
  2. Nâng cấp Bầu trời 2K + Hạt không khí sắc nét + Khung cảnh 360° bên ngoài: `src/components/library3d/worldMaterials.ts`, `src/components/library3d/WorldHorizonVista.tsx` (mới, `<= 450` dòng), `src/components/library3d/BiomePropsMesh.tsx`, `src/components/library3d/WorldBiomeMesh.tsx`.
  3. Đại Thư Viện Hoàng Gia Tầng 3 (`starfield_atrium`): `src/components/library3d/GrandLibraryHallMesh.tsx` (mới, `<= 450` dòng), `src/components/library3d/worldGeometryBuilder.ts`, `src/components/library3d/WorldBiomeMesh.tsx`, `src/components/library3d/biomeBlueprints.ts`.
  4. Tài liệu: `HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (`D-022`).

---

## 1. Phân tích vấn đề & Phương án lựa chọn

### A. Tầng 3 — Đại Thư Viện Hoàng Gia (`starfield_atrium`)
**Nguyên nhân hiện tại xấu:** `buildStarfieldTerrain` chỉ dựng 4 bức tường hộp đá xám phẳng trơn, trần đặt vài thanh ngang thẳng; đặc biệt khi thư viện mới có 51 cuốn (nằm hết ở Tầng 1), Tầng 3 có **0 kệ sách người dùng** nên biến thành nhà kho đá trống rỗng.

| Phương án | Mô tả | Ưu điểm | Điểm yếu / Rủi ro |
|---|---|---|---|
| **PA-1 (Khuyến nghị):** Kiến trúc **Đại Thư Viện 2 tầng mái vòm Gothic (`GrandLibraryHallMesh.tsx`)** + 2.000+ sách trang trí `InstancedMesh` trên tường | Xây 2 tầng tủ gỗ óc chó áp tường 4 mặt (tầng trệt + ban công lửng tầng 2 có lan can đồng & thang thư viện), cửa sổ vòm kính màu cao vút phát sáng, mái vòm gân đồng uốn cong thật mở ra trần kính sao, thảm nhung đỏ viền vàng trải dọc đại sảnh, 4 đèn chùm đồng nhiều tầng + đèn bàn xanh cổ điển + `pointLight` ấm áp. Các neo kệ trung tâm vẫn giữ nguyên để gắn kệ sách thật của người dùng. | Đúng chất Đại Thư Viện cổ điển châu Âu / Aincrad ngay cả khi Tầng 3 chưa có kệ người dùng nào; 0 CDN, dung lượng thêm ~0 KB asset, `<= 12` draw call; giữ nguyên 100% collider/vật lý & vị trí 6 neo kệ sách tương tác. | Là kiến trúc dựng hình procedural + Canvas2D PBR (không có chi tiết chạm khắc phù điêu siêu nhỏ như file scan 3D trăm MB). |
| **PA-2:** Nạp `glb/scene/library.glb` có sẵn trong thư mục | Phóng to model phòng học `library.glb` (`4.48 × 3.00 × 4.82 m`, 216k tam giác). | Tận dụng sẵn file `.glb`. | **Không khả thi thực tế:** phòng gốc nhỏ hơn cả bán kính camera góc nhìn thứ 3 (`4.6 m`); phóng to 8× làm bàn ghế cao 6 m, tường vỡ tỉ lệ và phá hỏng toàn bộ không gian 39×44 m của Tầng 3. |
| **PA-3:** Dựng khung Đại Thư Viện như PA-1 + mở sẵn cổng thay vỏ kiến trúc bằng `.glb` lớn nếu sau này tìm được | Giống PA-1 ngay bây giờ, đồng thời tách riêng vào `GrandLibraryHallMesh.tsx` để dễ thay/ghép `.glb` Đại Thư Viện quy mô lớn sau này. | Đẹp ngay lập tức mà vẫn linh hoạt mở rộng. | Hơi tốn công tách module sạch ngay từ đầu (nhưng rất có lợi vì giữ mọi file `< 500` dòng). |

→ **Khuyến nghị: PA-1 (kèm cấu trúc tách module sạch kiểu PA-3).**

### B. Khung cảnh 360° không gian bên ngoài (`WorldHorizonVista.tsx` + Sky 2K)
**Nguyên nhân hiện tại trống:** `SkyDome` chỉ `512×256` trơn, ngoài rìa đảo không có bất kỳ núi non / đảo bay / biển mây nào; hạt đom đóm `size={0.24}` bị phóng to thành cục vuông trắng mờ khi trôi sát camera.

| Phương án | Mô tả | Ưu điểm | Điểm yếu / Rủi ro |
|---|---|---|---|
| **PA-A (Khuyến nghị):** **SkyDome 2K (`2048×1024`) + Vành đai 3D 360° Aincrad (`WorldHorizonVista.tsx`) + Hạt đom đóm sắc nét** | (1) Vẽ lại `SkyDome` độ phân giải `2048×1024` có Dải Ngân Hà, tinh vân, cực quang mờ, Mặt Trăng chi tiết có quầng sáng (Đêm), mây hoàng hôn rực rỡ (Chiều) và mây cuộn nắng sớm (Ngày). (2) Dựng `WorldHorizonVista.tsx` (`<= 5` draw call, tầm xa `55–220 m`, không ảnh hưởng collider): **biển mây tầng thấp trôi chậm** bên dưới hòn đảo (`Y = -6..-26 m`), **dãy núi 360° chập chùng** (Tầng 2 có núi Phú Sĩ + tháp chùa xa), **quần đảo bay Aincrad + tàn tích cổng vòm + cột pha lê lơ lửng + bóng vành tầng trên khổng lồ của Lâu đài Aincrad** (Tầng 4), và **tháp lâu đài xa** nhô trên mái phố châu Âu (Tầng 1). (3) Hạ kích thước & làm nét sprite hạt đom đóm/hoa anh đào (`0.08–0.12`, additive glow nhẹ, né trôi sát mặt camera). | Xoá hoàn toàn cảm giác "đứng trên tảng đá giữa khoảng không xanh rỗng"; đúng chất Lâu đài Bay Aincrad ở mọi góc xoay 360°; 0 CDN, siêu nhẹ GPU. | Thêm ~1.5 MB RAM cho texture bầu trời 2K (rất nhỏ so với máy tính bàn, và chỉ nạp ở chế độ 3D — 0 byte ở 2D/mobile). |
| **PA-B:** Chỉ nâng SkyDome lên 2K vẽ phẳng đường chân trời, không có vật thể 3D bên ngoài | Chỉ vẽ núi/mây lên mặt cầu bầu trời. | Rất nhanh làm. | Thiếu chiều sâu thị sai (parallax) khi di chuyển; nhìn xuống mép đảo vẫn thấy trống rỗng không có biển mây hay đảo bay 3D. |

→ **Khuyến nghị: PA-A.**

---

## 2. Các Phase triển khai

### Phase 1 — Gỡ sạch NPC Yui lỗi váy
- Xoá `public/models/npc-yui.glb`.
- Gỡ `'yui'` khỏi `NpcModelKey` (`worldTypes.ts`), `NPC_MODEL_META` (`AmbientNpcs.tsx`) và 4 tầng trong `biomeBlueprints.ts` (giữ nguyên **Asuna đi dạo + Idle**, **Zhongli**, **Maid**, **Silica/SchoolGirl**, **Mint** — 5 NPC chuẩn không lỗi).
- **Hoàn tác:** `git checkout` 4 file + khôi phục `public/models/npc-yui.glb`.

### Phase 2 — Bầu trời 2K + Hạt sắc nét + Khung cảnh 360° Aincrad (`WorldHorizonVista.tsx`)
- Nâng `paintSkyCanvas` trong `worldMaterials.ts` lên `2048×1024` (Dải Ngân Hà, tinh vân, cực quang, Mặt Trăng có hố & quầng sáng, Mặt Trời + tia sáng + mây khối nhiều lớp, tương thích đủ 12 tổ hợp `4 Biome × 3 Theme`).
- Tạo `src/components/library3d/WorldHorizonVista.tsx` (`<= 450` dòng):
  - Biển mây mềm nhiều lớp trôi nhẹ dưới chân đảo (`Y = -5..-22 m`).
  - Vành đai núi non 360° nhiều lớp chiều sâu (tự đổi tông theo Biome & Theme; Tầng 2 có đỉnh tuyết + chùa xa; Tầng 1 có cụm tháp thành cổ xa nhô trên mái phố; Tầng 4 có quần đảo bay Aincrad, cổng đá vỡ lơ lửng, cột pha lê phát sáng & bóng vòng đế tầng trên khổng lồ của Aincrad trên cao).
  - Toàn bộ geometry/texture giải phóng sạch `dispose()` khi unmount.
- Tinh chỉnh `BiomeParticles` trong `BiomePropsMesh.tsx`: giảm `size` (`0.09–0.13`), tinh chỉnh sprite tròn sắc cạnh + `AdditiveBlending` cho đom đóm/bụi sao, bỏ hoàn toàn hiện tượng "cục vuông trắng mờ khổng lồ".
- Chỉnh `fogFar` trong `worldPalettes.ts` (`180 -> 280 m`) để khung cảnh 360° hiện rõ mà vẫn có chiều sâu sương mờ tự nhiên ở chân trời.

### Phase 3 — Đại Thư Viện Hoàng Gia 2 tầng mái vòm Tầng 3 (`GrandLibraryHallMesh.tsx`)
- Tạo `src/components/library3d/GrandLibraryHallMesh.tsx` (`<= 450` dòng) thay cho hộp tường đá xám đơn điệu của `starfield_atrium`:
  - **2 tầng kệ tường gỗ óc chó khổng lồ** chạy dọc tường Tây, Đông, Nam và hai cánh Bắc (có phân khoang cột gỗ, phào đồng, thang trượt thư viện bằng đồng).
  - **Hơn 1.800 cuốn sách cổ điển `InstancedMesh`** (gáy da đỏ burgundy, xanh rêu, lam đậm, nâu da, viền nhũ vàng) xếp chật kín toàn bộ các tầng kệ áp tường — tạo linh hồn Đại Thư Viện thật sự ngay cả khi Tầng 3 có 0 sách người dùng!
  - **Hành lang tầng lửng (Mezzanine Balcony, `Y = 4.5 m`)** với thanh dầm gỗ đỡ, lan can đồng chạm khắc chạy quanh 3 mặt đại sảnh.
  - **Cửa sổ vòm Gothic cao vút** xen giữa các khoang sách (có khung nan đồng & kính phát sáng ánh nắng / hoàng hôn / ánh trăng từ bên ngoài).
  - **Mái vòm gân đồng cong nhiều đốt** (`Y = 9.5 -> 14.2 m`) vươn cao lên vòm kính sao trung tâm.
  - **Thảm hoàng gia đỏ thẫm viền vàng** (CanvasTexture hoa văn dệt) trải từ cổng vào → sảnh giữa → cầu thang kính lên Đài Boss.
  - **4 Đèn chùm đồng hai tầng treo dọc trục giữa** (vòng đồng + chụp nến sáng ấm + `pointLight` vàng dịu) & đèn bàn đọc cổ điển.
- Dọn bớt phần tường xám trơn thừa trong `buildStarfieldTerrain` (`worldGeometryBuilder.ts`) để nhường chỗ cho `GrandLibraryHallMesh.tsx` (vẫn giữ nguyên 100% mặt sàn đá PBR, cầu thang kính, bục tầng trên, collider và 6 neo kệ sách người dùng!).

### Phase 4 — Kiểm định & Cập nhật tài liệu
- Chạy `npm run typecheck`, `npm run lint` (0 lỗi / 0 cảnh báo, mọi file `<= 500` dòng), `npm run build` (giữ entry 2D `<= 86.04 kB gzip`, `0 B three`, `0 CDN`), `verify-4a-t1.mjs` (21/21) & `verify-4a-t2.mjs` (6/6).
- Cập nhật `HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (`D-022`) trong cùng commit.

---

## 3. Checklist kiểm thử
- [ ] Không còn Yui ở cả 4 tầng; Asuna vẫn đi dạo mượt & dừng chào Kirito, Zhongli/Maid/Silica/Mint chuẩn không lỗi.
- [ ] Đứng ở Tầng 2 và Tầng 4 xoay 360°: thấy rõ biển mây dưới chân đảo, quần đảo bay Aincrad / dãy núi 360°, Dải Ngân Hà + Mặt Trăng / Mặt Trời 2K sắc nét; đom đóm nhỏ tinh tế, hết cục trắng mờ to.
- [ ] Vào Tầng 3 (`Đại Thư Viện Starfield`, cả khi có 0 sách trên tầng): thấy đầy đủ 2 tầng kệ tường gỗ đầy sách cổ điển, ban công tầng lửng, cửa sổ vòm kính sáng, mái vòm cong đồng, thảm đỏ viền vàng, đèn chùm đồng ấm áp; vẫn đi lại mượt, lên cầu thang, mở Cửa Phòng Boss & bấm đọc sách bình thường.
- [ ] Chuyển qua lại 3 theme `Ban ngày / Chiều tối / Đêm khuya` trên cả 4 tầng: màu bầu trời, núi/đảo bay, kính cửa sổ, đèn chùm đổi đồng bộ đẹp mắt.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, 21/21 test 4A-T1, 6/6 test 4A-T2 đều xanh; 0 URL CDN; entry 2D `<= 86.04 kB gzip`.
