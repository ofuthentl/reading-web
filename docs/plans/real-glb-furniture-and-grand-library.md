# Kế hoạch: Thay thế toàn bộ vật dụng nhựa & Tầng 3 bằng Real PBR `.glb` + Sửa dứt điểm cầu thang Tầng 2/3 (PA-A)

- **Nhánh:** `feat/library-3d`
- **Ngày lập:** 2026-11-21
- **Quyết định chốt:** PA-A (kết hợp sửa sạch lỗi cầu thang Tầng 2 & hở vách Tầng 3 + thay toàn bộ đồ nội thất hộp bằng 9 model `.glb` thật nén WebP 1024 + Meshopt, 0 CDN).

## 1. Tài sản `.glb` thật từ `glb/item/` → `public/models/` (WebP 1024 + Meshopt, 0 CDN)
| Nguồn (`glb/item/`) | Đích (`public/models/`) | Xử lý | Vai trò |
|---|---|---|---|
| `wooden_bookcases_with_books.glb` | `prop-bookcase-victorian.glb` | Giữ riêng `Victorian_Bookcase_Tall` + 7 hàng sách thật (bỏ tủ nhỏ lệch X), căn tâm đáy Y=0 | Kệ sách Victorian 2 tầng ốp kín 4 mặt tường Đại Thư Viện Tầng 3 |
| `library_table.glb` | `prop-library-table.glb` | Nén WebP + Meshopt, chuẩn hoá tâm đáy | Thay 100% `reading_table`, `librarian_desk` & bàn đọc Tầng 3 trên cả 4 tầng |
| `chair_-_library_wooden.glb` | `prop-library-chair.glb` | Nén WebP + Meshopt | Thay 100% ghế băng hộp (`bench`) & ghế bàn học trên cả 4 tầng |
| `free_ancient_stone_door_with_carved_dragon.glb` | `prop-dragon-door.glb` | `metalrough` + `simplify 0.4` + WebP + Meshopt | Thay 100% Cửa Phòng Boss (`boss_door`) hộp vuông trên cả 4 tầng |
| `library_stairs.glb` | `prop-library-stairs.glb` | Nén WebP + Meshopt, kiểm khớp độ dốc `-Z` | Thay cầu thang kính nhấp nháy Tầng 3 khớp vật lý `Z: -12 -> -17.5, Y: 0 -> 1.8` |
| `spiral_stairs_free.glb` | `prop-spiral-stairs.glb` | Nén WebP + Meshopt | Cầu thang xoắn ốc đôi nối tầng trệt lên ban công tầng lửng Tầng 3 |
| `pile_of_books.glb` | `prop-book-pile.glb` | Nén WebP + Meshopt | Chồng sách cổ đặt trên mọi Bàn đọc & Bục Thủ thư (bỏ cục trắng vuông) |
| `stylized_medieval_stone_water_well.glb` | `prop-stone-well.glb` | Nén WebP + Meshopt | Giếng đá cổ trang trí sân Đền Tầng 2 |
| `old-stone_platform.glb` | `prop-stone-platform.glb` | Nén WebP + Meshopt | Bệ đá cổ đỉnh đền Tầng 2 & Đài Boss Tầng 4 |

*(Bỏ qua `gothic_library.glb` 1.73M tris scan cắt nhỏ 10×5m unlit, `item/library.glb` phòng nhỏ 8.5m có bàn 1.28m, và `battle_boss.glb` sân hở Smash Bros vì không hợp phòng kín 360°.)*

## 2. Các Phase triển khai
- **Phase 1:** Chạy pipeline nén & chuẩn hoá 9 file `public/models/prop-*.glb`, kiểm chứng decode bằng `GLTFLoader + MeshoptDecoder` (0 lỗi UV/normal/bbox).
- **Phase 2:** Sửa dứt điểm lỗi cầu thang Tầng 2 (`ground` Z `-28.0 -> -29.5` hết cắt ngang `mountain-stairs.glb`), bịt kín 100% 4 bức tường & góc Tầng 3 (hết lỗ hổng và tường cắt chéo), thay cầu thang kính Tầng 3 bằng `prop-library-stairs.glb`, thay kệ tường hộp bằng dàn `prop-bookcase-victorian.glb` 2 tầng + đôi cầu thang xoắn `prop-spiral-stairs.glb`, dịu màu đồng cổ/gỗ lì hết nhựa trong `proceduralMaterials.ts` & `WorldHorizonVista.tsx`.
- **Phase 3:** Tạo `WorldFurnitureGlbs.tsx` thay sạch toàn bộ `reading_table`, `librarian_desk`, `bench`, `boss_door` hộp bằng `prop-library-table.glb`, `prop-library-chair.glb`, `prop-book-pile.glb`, `prop-dragon-door.glb`, `prop-stone-well.glb`, `prop-stone-platform.glb` trên cả 4 tầng.
- **Phase 4:** Chạy `typecheck`, `lint`, `build` (entry `<= 86.04 kB gzip`, `0 B three`, `0 CDN`), 21/21 test 4A-T1 & 6/6 test 4A-T2; cập nhật `HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (`D-023`) và commit trên `feat/library-3d`.

## 3. Hoàn tác
Mọi thay đổi nằm gọn trên nhánh `feat/library-3d` (không chạm `main`), có thể hoàn tác sạch bằng `git revert` commit tương ứng.
