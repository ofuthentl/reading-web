# HANDOFF
Cập nhật: 2026-11-21 11:50 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.70 kB gzip, 0 B three) · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Đã hoàn tất **Tab Thư viện 2D (`D-018`)** trên `feat/library-3d` → tiếp tục **Sub-phase 4A-T3**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/library-series-tab.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Tab Thư viện 2D (`D-018`) hoàn tất & kiểm định XANH 100%:**
  - Cặp tab 2D `Trang chủ` | `Thư viện` trên `LibraryHeader.tsx` (ẩn hoàn toàn trên HUD 3D, lưu tab lần cuối vào `localStorage` `ofu-library-active-tab`).
  - Lõi chọn bìa Tập 1 & thống kê kệ (`src/lib/shelfSummary.ts`): ưu tiên Tập 1 có ảnh bìa (tránh nhầm `Ngoại truyện`, hỗ trợ `Tập 01`/`Vol.1`/`v01`/`SAO1`), fallback tập nhỏ nhất có bìa hoặc bìa vải cổ điển (`pickClothCoverColor` dùng chung trong `bookMetadata.ts`).
  - Giao diện nạp lười (`LibraryCatalogView.tsx` lazy chunk `6.03 kB gzip`, giữ entry `84.70 kB <= 86.04 kB` theo `D-013`): lưới thẻ kệ `ShelfCoverCard.tsx` (2→6 cột, badge `N tập`, trạng thái đọc) và màn hình chi tiết kệ `ShelfDetailView.tsx` (drill-down tại chỗ, đồng bộ đổi tên kệ `syncRenamedShelf`, chọn nhiều khoanh vùng trong kệ).
  - Kiểm thử tự động `shelfSummary` PASS + kiểm thử trình duyệt end-to-end (desktop 1440px, laptop 1024px, mobile 390px, 3 theme, tương thích 3D) PASS.
- `glb/` đã bỏ qua trong `.gitignore`; `library_sample/` và `image.png` giữ untracked local.

## Bước tiếp theo
1. **Sub-phase 4A-T3**: hoàn tất & kiểm định `KiritoAvatar.tsx`, `AmbientNpcs.tsx`, `PlayerRig.tsx`, `WorldQuickBar.tsx` và nối cảnh Biome vào `LibraryCanvas.tsx`.
2. **Sub-phase 4A-T4 → 4A-T5**: `MinimapWidget.tsx`, `CozyGameHud.tsx`, `ambientAudio.ts`, `InteractiveStations.tsx` → kiểm thử trình duyệt & mở PR 4A → `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Tab Thư viện 2D (`feat/library-3d`, D-018):** thêm tab `Trang chủ` | `Thư viện`, tự động chọn bìa Tập 1 theo kệ (`shelfSummary.ts`), lưới thẻ kệ & trang chi tiết kệ drill-down nạp lười (`6.03 kB gzip`).
- **Sub-phase 4A-T2 (`feat/library-3d`):** nén 3 GLB vào `public/models/` (WebP 1024 + Meshopt local), căn chuẩn bbox cầu thang với ramp, dựng 4 World Biomes + SkyDome + Props + `InstancedBooksMesh` xoay đa hướng.
- **Sub-phase 4A-T1 (`feat/library-3d`):** mô hình Thế giới 4 Biome + vật lý OBB/dốc/cầu/camera (`19/19` test PASS).
