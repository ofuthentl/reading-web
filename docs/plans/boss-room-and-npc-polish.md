# Kế hoạch triển khai: Phòng Boss khóa tiến độ đọc (Aincrad Boss Room) & Tinh chỉnh dàn NPC/Cảnh 3D

> **Nhánh làm việc:** `feat/library-3d` (tuyệt đối không thao tác trực tiếp trên `main`).
> **Quyết định liên quan:** `D-010`, `D-013`, `D-016`, `D-017`, `D-019`, `D-020` (sẽ chốt `D-021` sau khi hoàn tất).

---

## 1. Mục tiêu
1. **Xây dựng Phòng Boss riêng kín 360° (`arena_side.glb`) khóa theo mốc số tập / số trang đọc tích luỹ (KHÔNG cố định bộ sách nào cho tầng nào):**
   - Gỡ toàn bộ Boss (`Boss Monster`, `Stone Golem`, `Stormterror`) khỏi không gian lộ thiên của các tầng.
   - Cuối mỗi tầng đặt **Cửa Phòng Boss (`boss_door`)** có ấn phong ấn trạng thái khóa/mở rõ ràng (song song giữ `portal_up` tách riêng để không chặn đọc tự do theo `D-016`).
   - **Quy tắc mở khóa linh hoạt toàn thư viện (`evaluateFloorBossUnlock(floorNumber, books, progress)`):**
     - Tính tổng tiến độ thực từ `ReadingProgress` trên **mọi cuốn sách bất kỳ** trong thư viện (không ép đọc bộ cố định cho từng tầng):
       - **Số tập hoàn thành (`completedBooks`):** đếm số sách có `completed === true` hoặc tiến độ `=== 100%`.
       - **Số trang quy đổi đã đọc (`readPages`):** `PDF` tính trực tiếp số trang đã đọc (`chapterIndex + 1` hoặc `totalChapters` khi hoàn thành); `EPUB/DOCX` quy đổi `20 trang/chương` theo `chapterIndex + scrollRatio`.
     - **Mốc mở khóa Tầng `N`** (`requiredBooks = N * (N + 1) / 2`, `requiredPages = requiredBooks * 150` — đạt **đủ số tập HOẶC đủ số trang** là mở khóa):
       - Tầng 1: `1 tập` hoặc `150 trang` · Tầng 2: `3 tập` hoặc `450 trang` · Tầng 3: `6 tập` hoặc `900 trang` · Tầng 4: `10 tập` hoặc `1.500 trang`...
     - Khi chưa đủ mốc: Cửa Phòng Boss mang ấn phong ấn đỏ-hổ phách, bấm `[E]` báo rõ `Đã đọc X/Y tập · A/B trang` và không cho vào.
     - Khi đạt mốc: ấn phong ấn chuyển sang lam-ngọc phát sáng, bấm `[E]` chuyển cảnh mượt vào **Phòng Boss Đấu trường kín 360°** (`boss-arena.glb`) nơi Boss tầng đó đang chờ, kèm cửa thoát quay về tầng bất cứ lúc nào.
2. **Xử lý triệt để dàn NPC bị T-pose và đi trượt cứng:**
   - Gỡ hoàn toàn `npc-yui.glb` (T-pose tĩnh không xương) khỏi scene và xóa file thừa trong `public/models/`.
   - Tổng hợp clip **`Idle` đứng thẳng thả tay tự nhiên + thở nhẹ** bằng script xương trực tiếp cho 2 model đã có xương thật: **`npc-zhongli.glb`** (186 xương) và **`npc-schoolgirl.glb`** (121 xương).
   - Chuyển toàn bộ NPC chưa có clip đi bộ (`asuna`, `maid`, `zhongli`, `schoolgirl`, `mint`) sang đứng/tạo dáng tự nhiên quanh kệ sách, bàn đọc, quầy thủ thư (tự xoay mặt chào Kirito khi lại gần; riêng `npc-mint.glb` chạy clip động 24s), **loại bỏ 100% kiểu trượt cứng `stroller` không bước chân**.
3. **Gỡ lỗi cảnh & nâng cấp đạo cụ/texture PBR từ các file `glb/scene/` mới:**
   - Gỡ sạch toàn bộ chùm dây leo lơ lửng (`p-ruins-vine-*`, `p-sakura-vine-*`) khỏi không trung.
   - Nén **`glb/scene/arena_side.glb`** → `public/models/boss-arena.glb` (`~3–4 MB`, WebP 1024 + Meshopt, ghép xoay 4 phía không tốn thêm VRAM).
   - Nén **`glb/scene/torii_gate.glb`** → `public/models/prop-torii-gate.glb` (`~1–1.5 MB`, sửa vật liệu `transparent` bị lỗi) đặt tại lối vào Tầng 2 (*Rừng Anh Đào*).
   - Trích 2 bộ texture WebP 1024 PBR thật (`~250 KB`/bộ): `public/textures/pbr-tile-*.webp` (sàn Đại sảnh Tầng 3) và `public/textures/pbr-stone-*.webp` (vách đá/tường Tầng 2 & 4).

---

## 2. Phân chia Phase nhỏ

### Phase 1 — Xử lý Asset 3D & Rig Idle cho NPC (`public/models/` & `public/textures/`)
- **Tạo / cập nhật:**
  - Tổng hợp clip `Idle` thả tay tự nhiên + nhịp thở cho `npc-zhongli.glb` & `npc-schoolgirl.glb` (kiểm đo toạ độ vai/khuỷu/cổ tay thực trong Node giống Kirito).
  - Xóa `public/models/npc-yui.glb` (T-pose tĩnh).
  - Nén `arena_side.glb` → `public/models/boss-arena.glb` và `torii_gate.glb` → `public/models/prop-torii-gate.glb` (WebP 1024 + Meshopt, 0 CDN).
  - Trích 6 ảnh WebP PBR (`pbr-tile-{albedo,orm,normal}.webp`, `pbr-stone-{albedo,orm,normal}.webp`).
- **Kiểm định Phase 1:** chạy script Node `GLTFLoader` + `MeshoptDecoder` kiểm chứng `badUv = 0`, `badNormal = 0`, `unlit = 0`, `AnimationMixer` chạy thực trên `npc-zhongli.glb` & `npc-schoolgirl.glb`.

### Phase 2 — Dọn dây leo lơ lửng, cập nhật NPC & bổ sung Cổng Torii + Texture PBR
- **Sửa file:**
  - `src/components/library3d/worldTypes.ts`: thêm `boss_door` / `boss_exit` vào `WorldStationKind`, thêm `'torii_gate_glb'` vào `BiomePropKind`, bỏ `'yui'` khỏi `NpcModelKey`, thêm `BossRoomUnlockStatus`.
  - `src/components/library3d/biomeBlueprints.ts`: gỡ toàn bộ `vine_glb` lơ lửng, chuyển toàn bộ NPC sang vị trí đứng tự nhiên quanh kệ/bàn/quầy (bỏ `stroller` trượt cứng, bỏ `yui`), gắn `torii_gate_glb` tại Tầng 2, thêm trạm `boss_door` cuối mỗi tầng.
  - `src/components/library3d/AmbientNpcs.tsx`: chạy `AnimationMixer` cho cả `zhongli`, `schoolgirl` và `mint`, bỏ logic nhún trượt cứng.
  - `src/components/library3d/worldMaterials.ts`: nạp lười 2 bộ PBR `pbr-tile-*` (Tầng 3) và `pbr-stone-*` (Tầng 2 & 4) kèm `dispose()` đầy đủ.

### Phase 3 — Kiến trúc Phòng Boss riêng 360° & Khóa tiến độ đọc 100%
- **Tạo file mới:**
  - `src/components/library3d/bossRoomLayout3d.ts` (~140 dòng): hàm thuần tính điều kiện mở khóa (`evaluateFloorBossUnlock(floor, progress)` — kiểm tra 100% sách trên tầng hoàn thành) và tạo `FloorWorldLayout3D` cho Phòng Boss 360° (`bounds` bán kính 10.5 m, collider tường bao quanh chống xuyên tường/camera, điểm spawn, vị trí Boss trung tâm, trạm `boss_exit` quay lại tầng).
  - `src/components/library3d/BossArenaMesh.tsx` (~160 dòng): render Đấu trường kín 360° từ `public/models/boss-arena.glb` (nhân bản 4 mặt tường + cổng đá lớn, ánh sáng đuốc/hào quang kịch tính theo từng Boss, gắn duy nhất Boss của tầng ở trung tâm đấu trường: Tầng 1 `Stone Golem`, Tầng 2 `Boss Monster`, Tầng 3 `Stone Golem`, Tầng 4 `Stormterror`).
- **Sửa file:**
  - `src/components/library3d/WorldGlbActors.tsx` & `BiomePropsMesh.tsx`: **gỡ hoàn toàn Boss ra khỏi các tầng lộ thiên**, thêm `ToriiGateGlb` & hiệu ứng phong ấn khóa/mở (đỏ-hổ phách khi khóa / lam-ngọc khi mở) cho `boss_door`.
  - `src/components/library3d/WorldBiomeMesh.tsx`, `FantasyLibrary3D.tsx`, `WorldQuickBar.tsx`: quản lý trạng thái `inBossRoomFloorIndex: number | null`; chặn mở Cửa Phòng Boss khi chưa hoàn thành 100% sách tầng (hiện thông báo tiến độ rõ ràng), khi đạt 100% chuyển cảnh mượt vào `BossArenaMesh` kèm nút/cửa thoát về tầng.

### Phase 4 — Kiểm định, cập nhật tài liệu & Commit
- Cập nhật `verify-4a-t1.mjs` (thêm test đi bộ & chống xuyên tường trong Phòng Boss + test khóa/mở 100% sách) và `verify-4a-t2.mjs` (test decode `boss-arena.glb`, `prop-torii-gate.glb`, `npc-zhongli.glb`, `npc-schoolgirl.glb`, 0 CDN).
- Chạy `npm run typecheck`, `npm run lint` (0 lỗi, 0 cảnh báo, mọi file `<= 500` dòng hiệu dụng), `npm run build` (bảo toàn entry 2D `<= 86.04 kB gzip`, `0 B three`).
- Ghi `D-021` vào `docs/DECISIONS.md`, cập nhật `docs/ARCHITECTURE.md` & `HANDOFF.md` trong cùng commit.

---

## 3. Rủi ro & Cách hoàn tác
| Rủi ro | Giảm thiểu | Cách hoàn tác |
|---|---|---|
| Xương `zhongli.glb` (186j) / `anime_school_girl_rigged.glb` (121j) có trục cục bộ khác Mixamo khiến tay xoay ngược | Dùng phép quay delta trong **không gian thế giới (`world-space axis`)** giống thuật toán đã thành công trên Kirito, in kiểm chứng tọa độ thực `(shoulder, elbow, hand)` trước khi xuất GLB | Giữ lại file nguồn trong `glb/npc/`, chỉ cần chỉnh góc trong script và xuất lại |
| `arena_side.glb` ghép 4 mặt có thể chồng mép hoặc lệch chiều cao sàn | Đo chính xác `min/max` từng mesh và căn tâm sàn `Y = 0` trong Node trước khi đặt 4 góc xoay `0 / 90° / 180° / 270°` | Đổi `BossArenaMesh.tsx` về đấu trường hình trụ đá gọn chỉ trong 1 file mà không ảnh hưởng các tầng chính |
| `torii_gate.glb` có `transparentMeshes = 25` có thể bị trong suốt sai | Kiểm tra từng material trong `torii_gate.glb`, tắt `transparent` cho gỗ/đá đục và chỉ bật `alphaTest` cho vật liệu có kênh alpha | Gỡ 1 dòng `prop('p-torii', ...)` trong `biomeBlueprints.ts` |
| Người dùng đang ở Tầng 1 có 51 cuốn chưa đọc xong 100% nên chưa vào được Phòng Boss Tầng 1 | Hiển thị rõ số cuốn đã xong `X/51` khi bấm Cửa Phòng Boss Tầng 1; tầng trống (`0` cuốn) mặc định cho mở vào thử Phòng Boss | Hoàn tác toàn bộ thay đổi dễ dàng qua `git revert` 1–2 commit sạch trên `feat/library-3d` |

---

## 4. Checklist kiểm thử (trước khi xem là xong)
- [ ] Không còn 2 chùm dây leo lơ lửng ở Tầng 2 & Tầng 4.
- [ ] Không còn Boss nào đứng lộ thiên ngoài cổng ở Tầng 1, 2, 3, 4.
- [ ] Không còn NPC nào đứng T-pose hay trượt cứng trên sàn; `Zhongli` & `SchoolGirl` đứng thả tay tự nhiên có nhịp thở, `Mint` chạy hoạt ảnh 24s, `Asuna` & `Maid` đứng tự nhiên quanh kệ/quầy.
- [ ] Cửa Phòng Boss Tầng 1 (khi chưa đọc xong 100% sách tầng) hiển thị phong ấn khóa và chặn vào + báo đúng số cuốn `X/Y`.
- [ ] Khi mọi cuốn trên tầng đạt 100% (hoặc trên tầng trống mở thử), bấm `[E]` tại Cửa Phòng Boss chuyển mượt vào **Phòng Boss Đấu trường 360°** có Boss đứng bên trong (`Stormterror` ở Tầng 4, `Boss Monster` ở Tầng 2, `Stone Golem` ở Tầng 1/3), đi dạo mượt không xuyên tường và bấm `[E]` ở cửa thoát quay về đúng tầng cũ.
- [ ] Tầng 2 có Cổng Torii sắc nét; Tầng 3 có sàn gạch PBR & Tầng 2/4 có vách đá PBR sắc nét.
- [ ] `npm run typecheck`, `npm run lint` (0/0), `npm run build` (`index-*.js <= 86.04 kB gzip`, `0 B three`, `0 CDN`) đều XANH.
