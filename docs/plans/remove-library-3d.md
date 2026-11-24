# Kế hoạch triển khai — Gỡ bỏ hoàn toàn Chức năng & Tài sản Thư viện 3D (`D-040`)

> **Mục tiêu:** Xoá sạch toàn bộ mã nguồn 3D (`FantasyLibrary3D`), các điểm nối 2D↔3D, toàn bộ tài sản `.glb` & texture PBR 3D, và 3 gói npm (`three`, `@react-three/fiber`, `@types/three`) để dự án tập trung 100% vào trải nghiệm Thư viện 2D gọn nhẹ, nhanh và dễ bảo trì.
> **Không chạm tới:** `public/sounds/*.m4a` (nhạc nền đọc sách 2D), `public/cursors/miku-sheet.png`, `src/lib/readingStats.ts` (đang dùng cho `ReadingStatsModal` 2D), hiệu ứng nghiêng bìa CSS 2D (`tilt-card`), toàn bộ Backend Worker / D1 / R2, và thư mục tài liệu `docs/` (`AGENTS.md` §10).

---

## 1. Quyết định đã chốt (`D-040`)

1. **Nhánh Git triển khai (`QĐ-1 = PA-B`):** Tách nhánh `refactor/remove-library-3d` trực tiếp từ `origin/main` (đã bao gồm PR #29) để mở PR gỡ 3D độc lập.
2. **Thư mục tài sản nguồn cục bộ `glb/` (`QĐ-2 = PA-1`):** Xoá vĩnh viễn cả thư mục `glb/` (`~1.43 GB`, 55 tệp) trên ổ đĩa và gỡ dòng `glb/` khỏi `.gitignore`.

---

## 2. Phân chia Giai đoạn (Phases), Rủi ro & Cách hoàn tác

### Phase 1 — Gỡ mã nguồn 3D & các cầu nối trong App 2D
- **Xoá hoàn toàn:**
  - Thư mục `src/components/library3d/` (**42 tệp**).
  - `src/components/Library3DHost.tsx`
  - `src/components/ViewModeToggle.tsx`
  - `src/hooks/useCanUse3D.ts`
- **Dọn sạch tham chiếu trong 2D:**
  - `src/App.tsx`: gỡ `useCanUse3D`, `LazyLibrary3DHost`, `toScene3DTheme`, `cycle3DTheme`, `render3D`, `is3DPaused`, `is3DDimmed`, `onSwitchTo3D` và các lệnh gọi `setViewMode('2d')` thừa; render trực tiếp `<Library2DView>`.
  - `src/components/LibraryHeader.tsx`, `src/components/Library2DView.tsx`, `src/components/Library2DDialogsHost.tsx`: gỡ `ViewModeToggle` và props `canUse3D`, `viewMode`, `onChangeViewMode`, `onSwitchTo3D`.
  - `src/components/CommandPaletteModal.tsx`: gỡ mục lệnh *"Bước vào Thư viện 3D (Aincrad Tower)"* và props `canUse3D`, `onSwitchTo3D`.
  - `src/hooks/useShelfDeepLink.ts`: gỡ `effectiveMode`, `setViewMode`.
  - `src/hooks/useTheme.ts`: gỡ các hàm cầu nối riêng cho 3D (`toScene3DTheme`, `getNext3DTheme`, `cycle3DTheme`) và gộp sạch `UiTheme` (4 chế độ màu 2D).
  - `src/types.ts`: gỡ `ViewMode`.
  - `public/sw.js`: bỏ `models|textures` và `glb` thừa trong regex chặn tài sản 3D (giữ nguyên chặn `sounds` & `.m4a` cùng toàn bộ route bảo mật `QĐ-D`).
- **Rủi ro:** Xoá nhầm import dùng chung với 2D (như `useTheme` hoặc `readingStats`) hoặc làm đổi hành vi deep-link / phím tắt `Ctrl+K`.
- **Giảm thiểu & Hoàn tác:** Chạy `npm run typecheck` và `npm run lint` ngay cuối Phase 1. Hoàn tác bằng `git revert` commit Phase 1.

### Phase 2 — Xoá toàn bộ tài sản 3D & gỡ phụ thuộc npm
- **Xoá tài sản trong Git (`~40.8 MB`, 37 tệp):**
  - `public/models/` (27 tệp `.glb`, `~39.4 MB`).
  - `public/textures/` (10 tệp `.webp` PBR chỉ dùng bởi `worldMaterials.ts` & `proceduralMaterials.ts`, `~1.36 MB`).
- **Tài sản cục bộ ngoài Git (theo `QĐ-2`):**
  - Nếu chọn `PA-1`: xoá thư mục `glb/` (`~1.43 GB`) và gỡ dòng `glb/` trong `.gitignore`.
- **Gỡ gói npm (`package.json` + `package-lock.json`):**
  - Gỡ `three`, `@react-three/fiber`, `@types/three` bằng `npm uninstall three @react-three/fiber @types/three`.
- **Rủi ro:** Gỡ gói npm có thể kéo thay đổi lockfile hoặc để sót tham chiếu `/models/`, `/textures/` trong code.
- **Giảm thiểu & Hoàn tác:** Quét lại `git grep` cho `three`, `@react-three`, `/models/`, `/textures/`, `.glb`, `library3d` đảm bảo `0` kết quả trong `src/` và `public/`; chạy `npm run build` kiểm tra đầu ra `dist/` không còn chunk `FantasyLibrary3D` (~1.1 MB) và không còn thư mục `dist/models/` / `dist/textures/`. Hoàn tác mọi phần trong Git bằng `git revert` commit Phase 2 *(riêng `glb/` nếu chọn `PA-1` không thể khôi phục bằng Git)*.

### Phase 3 — Cập nhật Tài liệu Kiến trúc, ADR & Bàn giao (`AGENTS.md` §7–§8)
- `docs/DECISIONS.md`: ghi quyết định mới **`D-040`** chốt gỡ bỏ hoàn toàn Chức năng & Tài sản 3D (thay thế các quyết định cũ `D-008`, `D-010`, `D-015`, `D-016`, `D-017`, `D-019` → `D-024`, giữ nguyên toàn bộ `D-001`–`D-039` ngoài phạm vi 3D).
- `docs/ARCHITECTURE.md`: xoá các dòng module/công cụ 3D đã gỡ trong Bảng module, mục *Công cụ đã có* và cập nhật *Trạng thái hiện tại*.
- `HANDOFF.md`: cập nhật ngắn gọn (< 60 dòng) trong cùng commit.
- *(Tuyệt đối không xoá các tệp kế hoạch lịch sử trong `docs/plans/` theo `AGENTS.md` §10).*

---

## 3. Checklist kiểm thử bắt buộc trước khi kết thúc (`AGENTS.md` §7)
- [x] `npm run typecheck` sạch 0 lỗi.
- [x] `npm run lint` sạch 0 lỗi / 0 cảnh báo.
- [x] `npm run build` sạch lỗi; kiểm tra `dist/` **không** còn chunk `FantasyLibrary3D-*.js`, **không** còn `dist/models/`, `dist/textures/`; `dist/assets/index-*.js` giảm từ `85.39 kB` xuống **`83.85 kB` gzip** (`<= 86.04 kB`).
- [x] `git grep` trong `src/`, `public/` & `package.json` xác nhận **0** tham chiếu `three`, `@react-three`, `library3d`, `useCanUse3D`, `ViewModeToggle`, `Library3DHost`, `/models/`, `/textures/`, `.glb`.
- [x] Đã chạy kiểm thử trực quan giao diện 2D trên trình duyệt thật (Local Dev `http://localhost:5175/`, Desktop `1280×800`): Header sạch không còn nút `2D/3D`, xoay đủ 4 chế độ nền (`light`/`noon`/`dim`/`midnight`), `Ctrl+K` không còn lệnh 3D, chuyển tab `Trang chủ` / `Thư viện` / `Ủng hộ` mượt với `0` ConsoleError / PageError / 404.
- [x] Đã cập nhật `docs/DECISIONS.md` (`D-040`), `docs/ARCHITECTURE.md` và `HANDOFF.md`.
