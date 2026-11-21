# Kế hoạch Bước 0 — Vá lỗi tồn đọng hậu PR 4A (`fix/post-4a-cleanup`)

> **Nhánh làm việc:** `fix/post-4a-cleanup` (tách từ `origin/main` `262e561`, không đụng trực tiếp `main`).
> **Mục tiêu:** Dọn dẹp dứt điểm các lỗi vòng đời 3D, tài sản `.glb` dư thừa, cập nhật render PBR ở chế độ giảm chuyển động và đồng bộ tài liệu hậu PR #5 trước khi bắt đầu PR 4B (`BookSpreadReader`).

---

## 1. Phạm vi thay đổi

1. **Chống commit nhầm tệp mẫu cục bộ (`.gitignore`):**
   - Bổ sung `library_sample/`, `*.mp4`, `/image.png` vào `.gitignore`.
2. **Vá lỗi vòng đời `paused` & giữ sống `<Library3DHost>` khi đọc sách (`src/App.tsx`):**
   - Đặt `isReaderOpen = Boolean(reader.activeBook && reader.parsedBook)`, `is3DPaused = Boolean(reader.openingBook || isReaderOpen || modal.kind !== 'none')`, `is3DDimmed = Boolean(reader.openingBook || isReaderOpen)`.
   - Khi `effectiveMode === '3d'`, giữ `<Library3DHost paused={is3DPaused} dimmed={is3DDimmed} />` sống ở nền (`0 FPS`, ngưng âm thanh môi trường, ẩn HUD, khoá phím `WASD`/`V`/`E` sau modal & trình đọc) và hiển thị `<ReaderView />` trên lớp `fixed inset-0 z-40` → đóng sách (`EPUB`/`DOCX`/`PDF`) quay về đúng vị trí/tầng của Kirito tức thì mà không giải mã lại `13 MB+` GLB.
   - Khi `effectiveMode !== '3d'` (2D desktop & mobile), chỉ mount `<Library2DView />` khi `!isReaderOpen`, bảo toàn hành vi 2D nhẹ 100%.
3. **Dọn Dead Asset & Dead Code `mountain-stairs.glb` (~321 KB) sau `D-023`:**
   - Xoá `public/models/mountain-stairs.glb`, gỡ `MountainStairsGlb` (`WorldGlbActors.tsx`), nhánh lọc trong `BiomePropsMesh.tsx`, kiểu `'mountain_stairs_glb'` (`worldTypes.ts`) và cập nhật chú thích trong `worldGeometryBuilder.ts`.
4. **Cập nhật khung hình khi tải xong texture PBR ở chế độ `prefers-reduced-motion` (`frameloop="demand"`):**
   - Gọi `onReady(tex)` **sau khi** đã gán `targets[i].map = tex` trong `attachLocalWoodAlbedo` (`furnitureGlbHelpers.ts`).
   - Cho phép truyền callback `onTextureReady?: () => void` vào `createLibraryMaterialBundle` (`proceduralMaterials.ts`) và `createWorldMaterialBundle` (`worldMaterials.ts`), nối vào `requestRender` của `LibraryCanvas.tsx`.
5. **Đồng bộ sổ bàn giao & kiến trúc:**
   - Cập nhật `docs/ARCHITECTURE.md`, `docs/plans/phase-4-aincrad-tower.md` và `HANDOFF.md` khớp trạng thái PR #5 đã merge và số lượng `27` tài sản `.glb` thực dùng.

---

## 2. Rủi ro & Cách hoàn tác

| Rủi ro | Giảm thiểu | Hoàn tác |
|---|---|---|
| `<ReaderView>` hiển thị lệch vị trí khi nằm cùng `<Library3DHost>` | Bọc `<div className="fixed inset-0 z-40">` quanh `<ReaderView />` (cao hơn `LibraryHeader z-30` & `LibraryCanvas z-0`, thấp hơn `ToastContainer z-50`) | `git revert` commit `fix(app)` |
| Vượt trần `eslint max-lines` (`<= 500` dòng hiệu dụng) hoặc trần entry 2D (`<= 86.04 kB gzip`) | Chỉ thêm tham số callback mỏng 1–3 dòng, không nạp thêm module nào vào entry 2D | Chạy `npm run lint` & `npm run build` kiểm tra |

---

## 3. Checklist Kiểm thử bắt buộc (`AGENTS.md` §7)
- [x] `npm run typecheck`, `npm run lint` (0 lỗi, 0 cảnh báo), `npm run build` (`index-*.js <= 86.04 kB gzip`, `0 B three` ở entry, `dist/models/mountain-stairs.glb` không còn tồn tại), Worker `npx tsc --noEmit` XANH.
- [x] Mở modal (`UploadDropzone` / `BookEditModal`...) trong 3D: cảnh 3D dừng `0 FPS`, ẩn HUD, bấm `WASD`/`V`/`E` không làm nhân vật di chuyển hay đổi góc nhìn xuyên qua modal.
- [x] Đi bộ tới kệ/tầng bất kỳ trong 3D → mở đọc sách → đóng sách: quay lại ngay đúng vị trí/tầng vừa đứng trong `0 ms` mà không reload WebGL/GLB.
- [x] Chế độ 2D & mobile `< 1024px`: mở/đóng sách và chuyển tab hoạt động nguyên vẹn, `0` chunk 3D được nạp, `0` lỗi console.
