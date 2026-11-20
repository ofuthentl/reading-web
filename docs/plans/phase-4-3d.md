# Kế hoạch Triển khai Phase 4 — Thư viện 3D (`FantasyLibrary3D`) & Sách Mở Đôi (`BookSpreadReader`)

> **Trạng thái:** Đã duyệt & chốt đủ 5 quyết định (`D-010` → `D-014` trong `docs/DECISIONS.md`), đã rebase `feat/library-3d` lên `origin/main` sau PR #4 (`D-009`: chỉ còn 3 định dạng `epub`, `pdf`, `docx`) — **đang triển khai PR 4A**.
> **Chiến lược chia PR (2 PR độc lập):**
> - **PR 4A — nhánh `feat/library-3d`** *(đã rebase sạch lên `origin/main` sau PR #2, PR #3 và PR #4 `feat/docx-drop-mobi-cbz`; không track `origin/main`)*: `useCanUse3D` + công tắc 2D/3D + `FantasyLibrary3D` (mở sách vẫn dùng `ReaderView` hiện có). **Merge độc lập vào `main`.**
> - **PR 4B — nhánh `feat/book-spread-reader`** *(tách mới từ `origin/main` **sau khi PR 4A đã merge**)*: `BookSpreadReader` (sách mở đôi 2 trang bằng HTML/CSS cho `EPUB` & `DOCX` nổi trên nền 3D làm mờ & dừng render + đồng bộ tiến độ đọc không đổi schema D1).
> **Ràng buộc bất biến:** `AGENTS.md` (mọi file `<= 500` dòng hiệu dụng, không commit/push trực tiếp lên `main`, tra "Công cụ đã có — cấm viết lại" trong `docs/ARCHITECTURE.md`, cập nhật `HANDOFF.md` ở mọi commit và `docs/ARCHITECTURE.md` ở mọi commit đổi cấu trúc), `docs/DECISIONS.md` (**D-004**, **D-008**, **D-009**, **D-010** → **D-014**).

---

## 1. Bối cảnh, Nguyên tắc Kiến trúc & Baseline

### 1.1. Tuân thủ D-004 & D-008
- **D-004:** Giao diện 2D và hệ thống Cloudflare Worker/D1/R2 đã hoàn thiện, ổn định trên `https://ofu.lol`. Thư viện 3D (`FantasyLibrary3D`) và sách mở đôi (`BookSpreadReader`) triển khai ở Phase 4 trên các nhánh riêng (`feat/library-3d` và `feat/book-spread-reader`), tuyệt đối không phá vỡ trải nghiệm 2D đang chạy.
- **D-008 (nguyên văn từ `docs/DECISIONS.md`):**
  > Thư viện 3D (`FantasyLibrary3D`) chỉ bật khi thiết bị đạt đủ cả 3 điều kiện: (1) viewport `>= 1024px`; (2) `matchMedia('(hover: hover) and (pointer: fine)')`; (3) tạo được WebGL context với `{ failIfMajorPerformanceCaveat: true }` — chỉ thử tạo context **sau khi** (1) và (2) đã đạt để mobile không phải tạo context nào. Mặc định dùng 2D khi `prefers-reduced-motion: reduce`. Có công tắc 2D/3D thủ công lưu trong `localStorage`; công tắc chỉ hiện khi thiết bị đạt đủ điều kiện và lựa chọn 2D của người dùng luôn được tôn trọng. iPad có trackpad/Magic Keyboard đạt đủ 3 điều kiện được vào 3D (chấp nhận, vẫn có công tắc về 2D). Nếu giữa phiên không còn đạt điều kiện (ví dụ thu nhỏ cửa sổ dưới `1024px`): chuyển hiển thị sang 2D, **không** gỡ chunk 3D đã tải, không mount lại liên tục; khi đạt lại điều kiện cho phép quay về 3D mà không tải lại chunk. Thiết bị không đạt (mobile/tablet cảm ứng): tuyệt đối không tải `three`, `@react-three/fiber`, `@react-three/drei`; bắt buộc nạp qua `React.lazy` + dynamic import sau bước kiểm tra điều kiện. Thiết kế giao diện 3D / trình đọc trong 3D (ví dụ "sách mở đôi 2 trang") **không** thuộc ADR này, để dành cho plan Phase 4 (3D).

### 1.2. Các phần lõi bất biến — CẤM sửa hoặc viết lại
Tra mục *"Công cụ đã có — cấm viết lại"* trong `docs/ARCHITECTURE.md`, toàn bộ tầng dữ liệu, lưu trữ, xác thực, parse và làm sạch HTML **giữ nguyên 100%**, không viết lại logic trùng:
- `src/lib/api.ts`: `fetchLibraryState`, `groupBooksIntoShelves`, `sortBooksByTitle`, `uploadBook`, `updateBookMetadata`, `updateBookCover`, `renameShelfAll`, `bulkUpdateBooksShelf`, `deleteBooks`, `fetchBookBlobCached`, `fetchCoverBlobCached`, `saveReadingProgress`, `formatBytes`.
- `src/lib/cache.ts`: IndexedDB cache sách/bìa/local state.
- `src/lib/shelfPlacement.ts`, `src/lib/bookMetadata.ts`, `src/lib/coverImage.ts`, `src/lib/epubChapters.ts`, `src/lib/docxXml.ts`, `src/lib/docxParser.ts`, `src/lib/parsers.ts`, `src/lib/sanitizeHtml.ts` (`DOMPurify` v3), `src/lib/pdfjsLoader.ts`.
- `src/lib/chunkReload.ts`: `isChunkLoadError`, `reloadOnceForStaleChunk`, `recoverFromChunkError`.
- `src/hooks/useBookReader.ts`, `src/hooks/useCoverUrl.ts`, `src/hooks/useTheme.ts`, `src/hooks/useToast.ts`.
- `src/components/ErrorBoundary.tsx` (tái sử dụng prop `fallback` sẵn có), 5 modal (`UploadDropzone`, `BookEditModal`, `ShelfRenameModal`, `BulkShelfModal`, `DeleteConfirmModal`), `ReaderSettingsPopover`, `ReaderTocDrawer`, `PdfReader`.
- `workers/r2-storage/*` và schema D1 (`books`, `reading_progress`): **0 thay đổi, không cần deploy lại Worker.**
- Phiên bản thư viện trong `package.json`: **giữ nguyên** `react ^18.3.1`, `three ^0.169.0`, `@types/three ^0.169.0`, `@react-three/fiber ^8.17.10`, `@react-three/drei ^9.114.3` (không nâng `@react-three/fiber` lên v9 vì v9 yêu cầu React 19; nếu dùng component của `drei`, chỉ import theo từng component/subpath cụ thể).

### 1.3. Baseline build hiện tại trên `origin/main` (sau PR #4 `D-009`)
Đo trực tiếp từ `npm run build` sau khi PR #4 (`feat/docx-drop-mobi-cbz`, bỏ MOBI/CBZ và gỡ `@lingo-reader/mobi-parser`, thêm DOCX) merge vào `origin/main` (**0 cảnh báo `sax`**):

| File trong `dist/assets/` | Kích thước raw | Kích thước gzip | Ghi chú |
|---|---:|---:|---|
| `index-*.js` (entry chính) | **275.72 kB** | **81.04 kB** | Trần sau Phase 4: **`<= 86.04 kB gzip`** (`+5.00 kB gzip` tối đa) |
| `index-*.css` | 43.13 kB | 8.60 kB | Stylesheet ứng dụng |
| `pdf-*.js` (`pdfjs-dist` lazy) | 483.15 kB | 144.26 kB | Chunk tải lười |
| `jszip.min-*.js` (lazy) | 97.74 kB | 30.37 kB | Chunk tải lười (dùng chung cho EPUB & DOCX) |
| `parsers-*.js` (lazy) | 52.34 kB | 19.76 kB | Chunk tải lười (EPUB/DOCX/PDF) |
| `PdfReader-*.js` (lazy) | 8.42 kB | 2.87 kB | Chunk tải lười |
| `pdf.worker.min-*.mjs` | 1,265.41 kB | — | Web Worker của PDF.js |
| `three` / `@react-three/*` | **0 kB** | **0 kB** | Chưa nạp (sẽ tách hoàn toàn vào chunk lazy ở PR 4A) |

### 1.4. Sơ đồ kiến trúc tổng thể Phase 4

```mermaid
flowchart TD
  App["src/App.tsx (State chung: books, progress, storage, 5 modals z-40, toast z-50)"]
  Gate["useCanUse3D (D-008: >=1024px + hover/fine + lazy WebGL + reduced-motion + localStorage)"]
  ViewState["useLibraryViewState (search, activeShelfKey, selectionMode, selectedIds)"]
  Lib2D["Library2DView (Mặc định mobile / 2D / fallback)"]
  Host3D["Library3DHost (ErrorBoundary fallback -> Library2DView + Suspense + React.lazy)"]
  Lib3D["FantasyLibrary3D [PR 4A — Lazy chunk]"]
  Canvas3D["LibraryCanvas (frameloop=demand, 3 InstancedMesh, <=20-24 CoverPlane, LRU createImageBitmap)"]
  Overlay3D["Library3DOverlay (HTML overlay <=z-20, Header z-30: Search, Shelf chips, Selection bar, BookInspectCard)"]
  ReaderFull["ReaderView + LazyPdfReader (PDF, 2D, hoặc bấm Toàn màn hình)"]
  SpreadHost["Lazy BookSpreadReader [PR 4B — Lazy chunk, EPUB/DOCX từ 3D]"]

  App --> Gate
  App --> ViewState
  Gate -- "2D hoặc không đạt D-008" --> Lib2D
  Gate -- "3D & đạt D-008" --> Host3D
  ViewState --> Lib2D
  ViewState --> Host3D
  Host3D -. "React.lazy" .-> Lib3D
  Host3D -- "Chunk lỗi / WebGL lost" --> Lib2D
  Lib3D --> Canvas3D
  Lib3D --> Overlay3D
  App -- "Đọc từ 2D / PDF / Toàn màn hình" --> ReaderFull
  App -- "Đọc EPUB/DOCX từ 3D (Canvas3D blur + paused)" -.-> SpreadHost
```

---

## 2. Thiết kế Chi tiết theo 4 Trụ cột

### 2.1. Ranh giới thiết bị (`useCanUse3D`) & Cơ chế Fallback lỗi (PR 4A)

#### Logic kiểm tra điều kiện (khớp tuyệt đối D-008)
Hook `src/hooks/useCanUse3D.ts` quản lý các trạng thái tách biệt rõ ràng:
1. **Điều kiện media (1) & (2):**
   - `viewportWide`: `window.matchMedia('(min-width: 1024px)')`
   - `fineHoverPointer`: `window.matchMedia('(hover: hover) and (pointer: fine)')`
   - `prefersReducedMotion`: `window.matchMedia('(prefers-reduced-motion: reduce)')`
2. **Điều kiện WebGL (3) — chỉ probe sau khi `(1) && (2)` đạt:**
   - Khi `!(viewportWide && fineHoverPointer)` → **không** tạo `<canvas>`, **không** gọi `getContext(...)`. Mobile và tablet cảm ứng hoàn toàn không chạm tới WebGL API.
   - Chỉ khi `viewportWide && fineHoverPointer` chuyển sang `true` lần đầu trong phiên, chạy hàm `probeHardwareWebGL()` (kết quả được cache cấp module trong suốt phiên để không probe lại mỗi lần resize):
     - Tạo `<canvas>` tạm trong bộ nhớ (không gắn DOM).
     - Thử `canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })`, nếu `null` thì thử `canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })`.
     - Nếu lấy được context → gọi `gl.getExtension('WEBGL_lose_context')?.loseContext()` ngay lập tức để trả lại WebGL context slot của trình duyệt, trả `true`; ngược lại trả `false`.
3. **Trạng thái công tắc 2D/3D (`localStorage`):**
   - Dùng lại kiểu `ViewMode = '3d' | '2d'` đã có trong `src/types.ts`.
   - Lưu tại `localStorage` key `'ofu-library-view-mode'` (`'2d'` hoặc `'3d'`), đồng bộ đa tab qua sự kiện `storage` (giống `useTheme.ts`).
   - Giá trị khởi tạo `preferredMode`:
     - Nếu `localStorage` có `'2d'` → `'2d'` *(lựa chọn 2D của người dùng luôn được tôn trọng)*.
     - Nếu `localStorage` có `'3d'` → `'3d'`.
     - Nếu `localStorage` chưa có giá trị:
       - Nếu `prefersReducedMotion === true` → mặc định **`'2d'`**.
       - Nếu `prefersReducedMotion === false` → mặc định **`'3d'`** (chỉ có hiệu lực khi `canUse3D === true` và người dùng đã qua màn hình `AuthGate`).
   - `canUse3D = viewportWide && fineHoverPointer && webglSupported === true`.
   - **Hiển thị công tắc (`ViewModeToggle`):** **chỉ render khi `canUse3D === true`**.
   - **Chế độ hiển thị thực tế:** `effectiveMode: ViewMode = canUse3D && !session3DFailed && preferredMode === '3d' ? '3d' : '2d'`.
4. **Thu nhỏ cửa sổ giữa phiên (không gỡ chunk, không mount lại liên tục):**
   - Khi `viewportWide` hoặc `fineHoverPointer` đổi trạng thái lúc người dùng đang kéo viền cửa sổ, áp dụng debounce **200ms** trước khi chốt chuyển đổi `effectiveMode` để tránh mount/unmount `<Canvas>` liên tục khi kéo qua mốc `1024px`.
   - Khi thu nhỏ `< 1024px`: chuyển hiển thị sang `Library2DView`. Module JS 3D đã được trình duyệt nạp bởi `import(...)` **nằm nguyên trong module registry của trình duyệt (không bị gỡ)**. Vì state tìm kiếm/lọc kệ/chọn nhiều nằm ở `useLibraryViewState` của `App.tsx`, người dùng không mất ngữ cảnh làm việc. Khi kéo cửa sổ rộng lại `>= 1024px`, `effectiveMode` quay về `'3d'` mà **không phát sinh request tải chunk mạng mới**.
5. **Nạp lười & Fallback lỗi không bao giờ trắng trang (`Library3DHost.tsx`):**
   - `const LazyFantasyLibrary3D = lazy(() => import('@/components/library3d/FantasyLibrary3D').then((m) => ({ default: m.FantasyLibrary3D })));`
   - `Library3DHost` chỉ được `App.tsx` render khi `authenticated && effectiveMode === '3d'`. Do đó:
     - Trên `AuthGate` (chưa đăng nhập): 0 byte `three` / `fiber` / `drei`.
     - Trên Thư viện 2D (`preferredMode === '2d'` hoặc `prefers-reduced-motion` mặc định): 0 byte `three` / `fiber` / `drei`.
     - Trên mobile / thiết bị không đạt D-008 (`canUse3D === false`): 0 byte `three` / `fiber` / `drei`.
   - Bọc `<LazyFantasyLibrary3D>` trong `<ErrorBoundary key={retryKey} fallback={...}>` hiện có:
     - Khi lỗi tải chunk cũ sau deploy (`404`) lúc đang Online: `ErrorBoundary.componentDidCatch` đã tự gọi `recoverFromChunkError(error)` → `isChunkLoadError` + `reloadOnceForStaleChunk()` (tải lại đúng 1 lần, chặn vòng lặp qua `sessionStorage`).
     - Khi đang Offline, hoặc đã hết lượt reload trong 30 giây, hoặc lỗi runtime trong scene 3D: `fallback` render component cầu nối nhỏ (`Library3DFallbackBridge`) lập tức hiển thị `<Library2DView ... />` đồng thời gọi `onFallbackTo2D(reason)` trong `useEffect` để hiện toast cảnh báo nhẹ và đánh dấu `session3DFailed = true`. Người dùng **không bao giờ thấy màn hình lỗi toàn trang**.
     - Khi `<canvas>` bắn sự kiện `webglcontextlost`: gọi `event.preventDefault()`, chờ tối đa `2500ms` xem có nhận `webglcontextrestored` không; nếu không khôi phục được (hoặc mất ngữ cảnh lần 2 trong cùng phiên) → tự động gọi `onFallbackTo2D('Ngữ cảnh đồ họa WebGL bị gián đoạn, đã chuyển về chế độ 2D.')` → chuyển tức thì về `Library2DView` + toast cảnh báo.
     - Nếu người dùng sau đó bấm lại công tắc `3D` (ví dụ sau khi nối lại mạng), gọi `reset3DFailed()` + tăng `retryKey` để thử khởi tạo lại 3D.

---

### 2.2. `FantasyLibrary3D` — Lớp hiển thị 3D & Kỷ luật GPU (PR 4A)

#### Tách sạch vai trò: chỉ là lớp hiển thị
- Tách state giao diện thư viện từ `Library2DView.tsx` lên hook dùng chung `src/hooks/useLibraryViewState.ts` đặt tại `App.tsx`:
  - State: `searchQuery`, `activeShelfKey`, `selectionMode`, `selectedIds` (tự dọn ID không còn tồn tại khi xoá sách, tự reset theo `selectionResetKey` sau khi chuyển kệ hàng loạt).
  - Derived (`useMemo`): `allShelves` (dùng `groupBooksIntoShelves`), `continueReadingBooks`, `filteredBooks`, `visibleShelves`, `selectedBooks`, `isFiltering`.
- `FantasyLibrary3D` nhận đúng các props state + callbacks từ `App.tsx` (tương đương `Library2DView`): `onOpenBook`, `onUploadClick`, `onEditBook`, `onRenameShelf`, `onMoveSelectedToShelf`, `onDeleteSelected`, `onRefresh`, `onLogout`, `onCycleTheme`, `onChangeViewMode`.
- Toàn bộ thanh Header (gồm dung lượng, nút tải sách, chọn nhiều, công tắc 2D/3D, đổi 3 chế độ màu, làm mới, đăng xuất), thanh tìm kiếm, chips lọc/nhảy kệ, thanh thao tác chọn nhiều (`Chọn tất cả`, `Chuyển kệ (N)`, `Xoá đã chọn (N)`), dải rút gọn "Tiếp tục đọc", và thẻ thông tin cuốn sách đang chọn (`BookInspectCard`) được render bằng **HTML overlay** phía trên `<Canvas>`.
- Toàn bộ 5 modal (`UploadDropzone`, `BookEditModal`, `ShelfRenameModal`, `BulkShelfModal`, `DeleteConfirmModal` — hiện đều dùng `z-40`) và `ToastContainer` (dùng `z-50`) giữ nguyên ở `App.tsx`; vì vậy `Library3DOverlay` bắt buộc giới hạn tối đa **`z-20`** (riêng Header **`z-30`**) để các modal và toast luôn nổi chính xác ở lớp trên cùng.

#### Kỷ luật GPU & Tài nguyên WebGL
1. **`frameloop="demand"` ở MỌI lúc:**
   - `<Canvas frameloop="demand" dpr={[1, 2]} shadows={false} gl={{ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true }}>`.
   - **Chỉ gọi `invalidate()` khi thực sự cần vẽ khung hình mới:**
     - Người dùng kéo/cuộn camera, nhấn phím di chuyển kệ, hoặc bấm chip nhảy sang kệ khác;
     - Trạng thái hover/chọn sách đổi sang cuốn khác (không `invalidate()` vô ích trên mọi pixel `pointermove` nếu `hoveredBookId` không đổi);
     - Vòng lặp giảm chấn (damping) của camera hoặc hoạt ảnh rút nhẹ cuốn sách ra khỏi kệ đang hội tụ — **ngắt ngay `invalidate()` khi `|target - current| < 1e-3`** (GPU về `0%` lúc đứng yên);
     - Texture bìa mới decode xong và gắn lên material;
     - Danh sách `visibleShelves` / `theme` / kích thước khung nhìn thay đổi.
   - **Dừng hẳn render** trong 2 tình huống:
     - Đang đọc sách (`paused === true`, bao gồm lúc mở `BookSpreadReader` ở PR 4B hoặc đang mở `openingBook`): chặn mọi lệnh `invalidate()`, vô hiệu hoá `pointer-events` trên `<Canvas>`, không chạy `useFrame` animation.
     - Tab bị ẩn (`document.visibilityState === 'hidden'`): lắng nghe `visibilitychange`, dừng ngay mọi animation và bỏ qua `invalidate()` cho đến khi tab hiện lại (`visible`), lúc đó chỉ vẽ lại đúng 1 khung hình đồng bộ.

2. **Hình học hằng số draw calls (`InstancedMesh`) & Chốt giới hạn `CoverPlane`:**
   - Toàn bộ các cuốn sách trên mọi kệ dùng **3 `InstancedMesh` cố định**:
     1. `bookBodyMesh`: khối gáy & bìa sách (màu từng cuốn lấy từ `book.cover_color` / bảng màu vải, set qua `setColorAt`, highlight khi `selected` hoặc khớp tìm kiếm);
     2. `bookPagesMesh`: khối ruột giấy trắng/kem ở phía trên & cạnh trong;
     3. `bookTrimMesh`: 2 dải viền chỉ nhũ vàng/đồng trên gáy tạo chiều sâu cổ điển.
   - **Chốt kỹ thuật `CoverPlane <= 20–24` slot tiêu điểm:** chỉ cấp phát tối đa **`20–24` mặt bìa `CoverPlane` tiêu điểm cùng lúc** (ưu tiên các cuốn gần tâm camera / đang hover / đang chọn trong các kệ thuộc `visibleShelfKeys`), toàn bộ các cuốn còn lại trên kệ lớn (như kệ 41+ cuốn bộ SAO) vẽ hoàn toàn bằng 3 `InstancedMesh` cố định → đảm bảo không bao giờ vượt trần `45 draw calls` và `36` LRU textures.
   - Khi 1 cuốn được hover hoặc chọn, chỉ cập nhật ma trận biến đổi (`setMatrixAt`) của đúng `instanceId` đó (nhô nhẹ ra trước `+0.08` đơn vị) và bật `instanceMatrix.needsUpdate = true` — **không tái tạo geometry, không tăng draw calls**.
   - Khung tủ kệ gỗ, thanh đỡ, tường nền, sàn gỗ sử dụng geometry gộp tĩnh (`mergeGeometries`) hoặc `InstancedMesh` theo từng khoang kệ (`<= 8` draw calls).

3. **Quản lý Texture bìa (`coverTextureCache.ts`) — Windowing + LRU + `createImageBitmap`:**
   - **Chỉ nạp cho kệ trong tầm nhìn:** `CameraRig` tính chỉ số kệ trung tâm đang nằm trước camera và phát ra `visibleShelfKeys` (kệ trung tâm ± 2 kệ lân cận). Chỉ các sách mặt trước / tiêu điểm thuộc các kệ này mới yêu cầu nạp texture bìa.
   - **Giới hạn đồng thời (Concurrency cap):** hàng đợi tải tối đa **`4` tác vụ song song** (`MAX_CONCURRENT_COVER_LOADS = 4`). Nếu kệ ra khỏi tầm nhìn khi yêu cầu còn nằm trong hàng đợi → huỷ ngay trước khi fetch/decode.
   - **Giới hạn VRAM (LRU cache):** lưu tối đa **`36` `THREE.Texture`** đồng thời (`MAX_COVER_TEXTURES = 36`). Mỗi khi truy cập cập nhật thứ tự dùng gần nhất; khi đầy sẽ evict entry ít dùng nhất (**tránh evict** các key đang gắn trên kệ hiển thị hiện tại nếu có thể).
   - **Decode không rò rỉ `ObjectURL`:**
     - Lấy `Blob` từ `fetchCoverBlobCached(coverKey)` đã có trong `src/lib/api.ts` (ưu tiên IndexedDB `0ms`, fallback R2).
     - Đường chính: `createImageBitmap(blob, { imageOrientation: 'flipY', resizeWidth: 256, resizeHeight: 384, resizeQuality: 'medium' })` (bọc `try/catch` fallback về `createImageBitmap(blob)` nếu trình duyệt không hỗ trợ option resize), tạo `new THREE.Texture(bitmap)` với `texture.flipY = false`, `texture.colorSpace = THREE.SRGBColorSpace`, `texture.generateMipmaps = true`, `texture.needsUpdate = true` → **0 `ObjectURL` được tạo**.
     - Đường fallback (chỉ khi `typeof createImageBitmap !== 'function'`): tạo `ObjectURL` → nạp `HTMLImageElement` → vẽ ra canvas `256×384` (hoặc tạo `THREE.Texture`) và **gọi `URL.revokeObjectURL(url)` ngay lập tức trong cả `img.onload` và `img.onerror`**.
   - **Giải phóng bắt buộc:**
     - Khi evict khỏi LRU hoặc khi `FantasyLibrary3D` unmount (`disposeAll()`): gọi tuần tự `texture.dispose()` và `bitmap.close()` (nếu có `ImageBitmap`), đồng thời huỷ toàn bộ request đang chờ.
     - Toàn bộ procedural `CanvasTexture`, `BufferGeometry`, `Material` của `LibraryRoomMesh` và `InstancedBooksMesh` đều có `useEffect` cleanup gọi `.dispose()`.

4. **Chính sách Asset (0 CDN bên ngoài):**
   - **Cấm tuyệt đối:** `<Environment preset="..." />` của `drei`, `<Text>` / `troika-three-text` dùng font CDN mặc định, `useGLTF` / `useTexture` tải từ URL bên ngoài, bất kỳ request mạng nào ngoài origin của app & API Worker.
   - **Nguồn vật liệu:** tạo 100% bằng code (procedural Canvas2D vân gỗ, hạt giấy, bảng tên kệ bằng font hệ thống) + đèn Three.js thuần (`hemisphereLight`, `directionalLight`, `pointLight`) đổi sắc độ theo 3 chế độ màu `light` (Ban ngày nắng ấm), `dim` (Chiều tối đèn thư phòng), `midnight` (Đêm khuya ánh trăng).

5. **Ngân sách hiệu năng (mục tiêu bắt buộc đạt):**

| Chỉ số | Ngân sách tối đa / Mục tiêu | Cách đo kiểm |
|---|---|---|
| **FPS khi tương tác / di chuyển** | Mục tiêu **`60 FPS`** (tối thiểu `>= 45 FPS` trên GPU tích hợp) | DevTools Rendering → Frame Rendering Stats |
| **FPS khi đứng yên / đọc sách / tab ẩn** | **`0 FPS`** (không vẽ khung hình thừa) | `frameloop="demand"` + kiểm đếm `onAfterRender` |
| **Số draw calls (`renderer.info.render.calls`)** | **`<= 45` draw calls** (mục tiêu `~20–35`), không tăng tuyến tính theo số sách | Kiểm tra với kho 100–500 cuốn |
| **Số texture trong VRAM (`renderer.info.memory.textures`)** | **`<= 40` textures** (`<= 36` bìa LRU + `<= 4` procedural; ước tính `<= 30 MB` VRAM ở `256×384`) | Đọc `gl.info.memory.textures` |
| **Lượt tải bìa song song** | **`<= 4` lượt cùng lúc** | Hàng đợi trong `coverTextureCache.ts` |
| **Tổng kích thước chunk 3D (lazy, gzip)** | **`<= 240 kB gzip`** (`three` + `@react-three/fiber` + scene 3D) | Output `npm run build` |
| **Chunk entry `index-*.js` (gzip)** | **`<= 86.04 kB gzip`** (tăng tối đa `+5.00 kB gzip` so với baseline `81.04 kB`) | Output `npm run build` |

---

### 2.3. `BookSpreadReader` — Sách mở đôi 2 trang bằng HTML/CSS (PR 4B)

#### Trải nghiệm & Luồng hiển thị
- **Mở sách từ Thư viện 3D (đồng bộ `D-009` & `D-012`):**
  - Với **EPUB** và **DOCX**: giữ `FantasyLibrary3D` ở lớp nền phía sau nhưng bật trạng thái `paused={true}` (dừng render hoàn toàn, tắt `pointer-events`) và áp lớp làm mờ + làm dịu ánh sáng (`filter: blur(8px) brightness(0.65)` hoặc lớp phủ `backdrop-blur-md bg-black/45`, ưu tiên lớp phủ `backdrop-blur` nhẹ hoặc CSS `blur` tĩnh 1 lần để GPU không phải re-blur cảnh động vì canvas đã dừng render).
  - Hiển thị **Sách mở đôi 2 trang bằng HTML/CSS** nổi chính giữa màn hình:
    - Khung bìa ngoài bo góc, hai lớp mép giấy xếp chồng ở cạnh trái/phải (`.book-spread-edge`), đường gáy giữa có dải bóng đổ mềm mô phỏng độ cong trang giấy (`.book-spread-spine`).
    - Đồng bộ hoàn toàn 4 bảng màu `READER_THEME_STYLES` (`paper`, `sepia`, `dark`, `midnight`) từ `src/lib/readerConfig.ts` — chữ và nền giấy hài hoà ở cả Ban ngày lẫn Đêm khuya.
    - **Chữ là DOM thật 100%** (chọn/copy chữ bình thường, sắc nét ở mọi mức DPI/zoom, hỗ trợ trình đọc màn hình); **không** vẽ văn bản lên `<canvas>` hay texture WebGL.
  - Với **PDF**: **luôn** mở bằng `ReaderView` / `PdfReader` hiện có. *(Cả `MOBI` và `CBZ` đã được loại bỏ hoàn toàn theo `D-009`.)*
- **Bảo mật & Tái sử dụng:**
  - Dùng lại trọn vẹn `useBookReader` (mở/đóng, cache IndexedDB, `dispose()` thu hồi `ObjectURL` khi đóng sách), `readerConfig` (`READER_THEME_STYLES`, `READER_FONT_CLASS`, `READER_WIDTH_MAX`), `ReaderSettingsPopover`, và `ReaderTocDrawer`.
  - Chỉ render `currentChapter.content_html` vốn đã được `DOMPurify` v3 làm sạch trong `src/lib/parsers.ts` / `src/lib/docxParser.ts` (`sanitizeBookDocument`) trước khi tạo `blob:` URL ảnh — **tuyệt đối không thêm bất kỳ đường `innerHTML` / `dangerouslySetInnerHTML` nào nhận nguồn HTML chưa qua sanitize**.
- **Điều hướng & Chuyển tức thì sang toàn màn hình:**
  - Lật trái/phải mượt (hiệu ứng CSS chuyển trang nhẹ 180–240ms; tự tắt khi `prefers-reduced-motion: reduce`):
    - Phím: `ArrowLeft` / `PageUp` (lùi spread), `ArrowRight` / `PageDown` / `Space` (tiến spread), `Escape` (đóng TOC → đóng Settings → đóng sách). Bỏ qua phím khi đang focus `input` / `textarea` / `contentEditable`.
    - Chạm/click vùng lề trái/phải (~14% hai mép sách, tôn trọng `settings.sideTapNavigation`, bỏ qua khi có vùng chữ đang bôi đen hoặc click trúng `a` / `button` / `input`).
    - Nút mũi tên Trước/Sau hai bên khung sách.
    - Vượt biên spread cuối chương → tự sang spread `0` chương kế tiếp; lùi trước spread `0` → tự về spread cuối của chương liền trước.
  - **Nút "Đọc toàn màn hình"** ngay trên thanh công cụ mảnh của `BookSpreadReader`:
    - Flush ngay tiến độ hiện tại (`onSaveProgress`), chuyển `readerDisplayMode` từ `'spread'` sang `'fullscreen'` → mở ngay `ReaderView` với **cùng `activeBook` và `parsedBook` trong bộ nhớ** (không tải lại, không parse lại), giữ nguyên đúng `chapterIndex` và `scrollRatio`.
  - **Thu nhỏ cửa sổ `< 1024px` khi đang đọc trong `BookSpreadReader`:** tự động flush tiến độ và chuyển sang `ReaderView` toàn màn hình tại đúng vị trí đọc để tuân thủ D-008 và không bị ép 2 trang chật hẹp trên màn hình nhỏ.
- **Tải lười `BookSpreadReader`:** nạp qua `React.lazy` riêng chunk ở `App.tsx`, nên thiết bị mobile/2D không bao giờ tải mã của `BookSpreadReader`.

#### So sánh kỹ thuật chia trang & Cơ chế Re-paginate (chốt `D-011`)
- **Chốt kỹ thuật cấu trúc DOM chống lệch `scrollWidth`:** `BookSpreadReader` bắt buộc tách **2 lớp DOM**: khung viewport ngoài cố định kích thước (`overflow-hidden`, rộng chẵn `colWidth * 2 + colGap`) bọc một **track nội bộ** đặt CSS Multi-column (`column-width: colWidth`, `column-gap: colGap`, `column-fill: auto`) và dịch chuyển track nội bộ theo `transform: translateX(-spreadIndex * spreadStride)` (đo `track.scrollWidth` trực tiếp trên track không bị ảnh hưởng bởi khung cắt ngoài hay padding/transform).

| Tiêu chí | Phương án A (Đã chốt `D-011`): CSS Multi-column + khung ngoài `overflow-hidden` bọc track nội bộ + `ResizeObserver` | Phương án B (Đã loại): Tự đo nội dung & tách DOM bằng JS (`Range` / `offsetHeight`) |
|---|---|---|
| Cơ chế | Khung ngoài `overflow-hidden` bọc track nội bộ đặt `column-width` = đúng 1 trang (làm tròn pixel nguyên), `column-gap` = khe gáy giữa, `column-fill: auto`; dịch ngang track theo bội số `spreadStride = 2 × (colWidth + colGap)` | Duyệt từng phần tử/text node, đo chiều cao và cắt DOM thành mảng `leftNodes` / `rightNodes` cho mỗi spread |
| Bảo toàn DOM & Bảo mật | Giữ nguyên cây DOM đã sanitize của chương; không serialize/cắt `innerHTML`; bôi đen chữ liên tục tự nhiên | Phải cắt/clone sâu giữa các thẻ lồng (`<blockquote>`, `<em>`, `<a>`, `<table>`), dễ hỏng markup hoặc rò rỉ node |
| Tốc độ tính lại (re-paginate) | **~2–8ms** (layout engine native của trình duyệt) | **50–300ms+** trên chương dài > 10.000 từ |
| Xử lý ảnh & `fontSize` | Bắt buộc lắng nghe `ResizeObserver` + ảnh `load`/`error` + đổi `settings`; cần ép `img { max-height; break-inside: avoid }` và làm tròn `colWidth` chống lệch sub-pixel | Kiểm soát từng phần tử chặt hơn nhưng logic xử lý phức tạp, dễ phình > 500 dòng |
| Hiệu ứng lật trang | Hiệu ứng trượt/mờ 2D–2.5D mượt, nhẹ CPU | Có thể làm 3D page-curl nhưng tốn công bảo trì cao |

**Các sự kiện bắt buộc kích hoạt tính lại số spread (`re-paginate`) và bảo toàn vị trí:**
1. Đổi `settings.fontSizePx`, `settings.lineHeight`, `settings.font`, `settings.width`;
2. Đổi kích thước cửa sổ / khung sách (`ResizeObserver` debounce ~80ms);
3. Đổi chương (`currentChapter.id`);
4. **Ảnh trong chương nạp xong:** vì `src/lib/parsers.ts` và `src/lib/docxParser.ts` gắn `loading="lazy"` cho ảnh EPUB/DOCX, trình duyệt có thể trì hoãn giải mã ảnh ở các cột bị ẩn ngoài khung `overflow-hidden`. Sau khi mount DOM của chương đang đọc, `useSpreadPagination` duyệt `container.querySelectorAll('img')`, đổi `img.loading = 'eager'` và gắn listener `load` + `error` (dọn sạch trong cleanup) để tự động tính lại `spreadsInChapter` ngay khi ảnh hoàn tất kích thước.
5. **Bảo toàn vị trí khi re-paginate:** trước khi cập nhật `spreadsInChapter` mới, giữ neo `anchorRatioRef` (tỉ lệ đọc hiện tại `0..1`) → tính lại `nextSpread = Math.round(anchorRatio * Math.max(0, nextSpreadsInChapter - 1))`, đảm bảo người dùng tăng/giảm cỡ chữ hoặc đổi kích thước cửa sổ không bị văng về đầu chương.

---

### 2.4. Đồng bộ Tiến độ đọc (KHÔNG đổi schema D1)

Bảng `reading_progress` trên Cloudflare D1 (`workers/r2-storage/schema.sql`) và kiểu `ReadingProgress` trong `src/types.ts` **giữ nguyên 100%**. Không thêm cột mới, không lưu `currentSpread / totalSpreads` của cả cuốn vì số spread thay đổi theo cỡ chữ và màn hình.

#### Công thức ánh xạ trong chương hiện tại (`src/lib/spreadProgress.ts`)
- **Khi lưu từ `BookSpreadReader`:**
  ```ts
  const scrollRatio = spreadIndex / Math.max(1, spreadsInChapter - 1);
  ```
- **Khi khôi phục vào `BookSpreadReader`:**
  ```ts
  const clampedRatio = Math.min(1, Math.max(0, initialProgress.scrollRatio || 0));
  const spreadIndex = Math.round(clampedRatio * Math.max(0, spreadsInChapter - 1));
  ```

#### Bảng quy ước từng trường của `ReadingProgress`

| Trường | Giá trị lưu từ `BookSpreadReader` | Ghi chú tương thích chéo với `ReaderView` & D1 |
|---|---|---|
| `chapterId` | `currentChapter.id` | Khớp 1-1 theo ID chương (giống `ReaderView.tsx:54`) |
| `chapterIndex` | `chapterIndex` (`0 .. chapters.length - 1`) | Fallback an toàn nếu ID thay đổi |
| `chapterTitle` | `currentChapter.title` | Hiển thị tên chương trên `BookCard` ("Tiếp tục đọc") và `COALESCE` của D1 |
| `totalChapters` | `chapters.length` | Để `BookCard.getProgressPercent` tính `%` toàn cuốn: `(chapterIndex + scrollRatio) / totalChapters` |
| `scrollRatio` | `spreadIndex / Math.max(1, spreadsInChapter - 1)` *(riêng khi bấm "Hoàn thành cuốn này!" ở chương cuối lưu `1`)* | `ReaderView.tsx:208` khôi phục cuộn **100% dựa vào `scrollRatio`** (`Math.round(maxScroll * targetRatio)`), nên đồng bộ chính xác trên mọi kích thước màn hình |
| `scrollTop` | **`0`** | Sách mở đôi không có thanh cuộn dọc; cột `scroll_top` trên D1 có `NOT NULL DEFAULT 0` và `ReaderView` không đọc trường này khi khôi phục |
| `completed` | `completedRef.current` (một khi `true` không bao giờ quay về `false`); tự set `true` và flush ngay khi ở chương cuối và `spreadIndex >= spreadsInChapter - 1` (kể cả chương cuối chỉ có đúng 1 spread), hoặc khi bấm nút **"Hoàn thành cuốn này!"** | Khớp hoàn toàn hành vi `ReaderView.tsx:73,178-179,435` |
| `updatedAt` | `Date.now()` | Giữ thứ tự danh sách "Tiếp tục đọc" chính xác |

- **Chiến lược ghi:** debounce `600ms` khi người dùng lật spread liên tục; **flush ngay lập tức** (`immediate = true`) khi đổi chương, đạt `completed`, bấm "Đọc toàn màn hình", thu nhỏ cửa sổ về `ReaderView`, hoặc đóng sách / unmount.

---

## 3. Lộ trình Triển khai theo Sub-phase (Mỗi Sub-phase = 1 Commit)

> **Quy tắc chung cho mọi sub-phase (`AGENTS.md` §5, §7, §8):**
> - Sau mỗi sub-phase, ứng dụng phải build xanh và chạy hoàn chỉnh.
> - Mọi file `.ts`/`.tsx` **bắt buộc `<= 500` dòng hiệu dụng** (ESLint `max-lines`).
> - Mọi commit đều cập nhật `HANDOFF.md`; mọi commit có thêm/đổi cấu trúc module đều cập nhật `docs/ARCHITECTURE.md` trong cùng commit đó.

---

### PHẦN A — PR 4A: Nhánh `feat/library-3d` *(Merge độc lập vào `main`)*

#### Sub-phase 4A.1 — Ranh giới thiết bị `useCanUse3D`, State dùng chung & Vỏ nạp lười `Library3DHost`
- **Thuộc:** **PR 4A** (`feat/library-3d`) — Commit dự kiến: `feat(3d): add D-008 device guard, shared library view state, and lazy 3D host`
- **Mục tiêu:** Cài đặt trọn vẹn luật D-008 (`useCanUse3D`), tách state tìm kiếm/lọc/chọn nhiều dùng chung lên `App.tsx`, thêm công tắc `ViewModeToggle` vào `LibraryHeader`, và nối sẵn đường `React.lazy` + `ErrorBoundary` fallback về `Library2DView` với vỏ `FantasyLibrary3D` tạm nhẹ (chưa kéo `three`) để xác minh ranh giới D-008 ngay từ bước đầu.
- **File tạo mới:**
  1. `src/hooks/useCanUse3D.ts` (~115 dòng): kiểm tra tuần tự `min-width: 1024px`, `(hover: hover) and (pointer: fine)`, lazy probe WebGL `{ failIfMajorPerformanceCaveat: true }` (chỉ chạy sau khi 2 điều kiện đầu đạt, giải phóng context test ngay), `prefers-reduced-motion: reduce`, lưu/đồng bộ `localStorage` (`ofu-library-view-mode`), debounce resize 200ms, cờ `session3DFailed` + `mark3DFailed` / `reset3DFailed`.
  2. `src/hooks/useLibraryViewState.ts` (~120 dòng): quản lý `searchQuery`, `activeShelfKey`, `selectionMode`, `selectedIds`, `normalizeSearchText`, `allShelves`, `continueReadingBooks`, `filteredBooks`, `visibleShelves`, `selectedBooks` dùng chung cho 2D & 3D.
  3. `src/components/ViewModeToggle.tsx` (~55 dòng): công tắc chuyển 2D/3D (chỉ render khi `canUse3D === true`, nhãn truy cập rõ ràng).
  4. `src/components/Library3DHost.tsx` (~95 dòng): khai báo `React.lazy` tới `FantasyLibrary3D`, bọc `<ErrorBoundary key={retryKey} fallback={...}>` + `<Suspense>` (fallback lỗi lập tức hiện `Library2DView` + gọi toast qua `useEffect`, không bao giờ hiện lỗi toàn trang).
  5. `src/components/library3d/FantasyLibrary3D.tsx` (~50 dòng — vỏ tạm ở 4A.1, sẽ được thay thế bằng cảnh thật ở 4A.3–4A.4): hiển thị khung placeholder đồng bộ theme kèm nút quay về 2D để test luồng lazy/fallback.
- **File sửa:**
  6. `src/components/LibraryHeader.tsx` (~185 dòng): thêm prop tuỳ chọn `canUse3D`, `viewMode`, `onChangeViewMode` và gắn `<ViewModeToggle />`.
  7. `src/components/Library2DView.tsx` (giảm từ 433 → ~365 dòng hiệu dụng): nhận `viewState` từ `App.tsx` thay vì tự giữ state nội bộ; truyền props công tắc 2D/3D xuống `LibraryHeader`.
  8. `src/App.tsx` (~235 dòng): gọi `useCanUse3D()` và `useLibraryViewState(...)`, chuyển đổi giữa `Library2DView` và `Library3DHost`.
  9. `docs/ARCHITECTURE.md` & `HANDOFF.md` (cập nhật trong cùng commit).
- **Rủi ro & giảm thiểu:**
  - *Probe WebGL vô tình chạy trên mobile:* chỉ gọi `probeHardwareWebGL()` bên trong điều kiện `if (viewportWide && fineHoverPointer)` và lưu cache kết quả.
  - *Mất state lọc/chọn khi thu nhỏ cửa sổ `< 1024px`:* `useLibraryViewState` đặt ở `App.tsx` nên giữ nguyên 100% state.
- **Cách hoàn tác:** `git revert <commit-4A.1>`.
- **Cách test nhanh:**
  - `npm run typecheck && npm run lint && npm run build` (xác nhận entry `index-*.js` tăng `<= 2 kB gzip`).
  - Trên DevTools Desktop `>= 1024px`: thấy công tắc 2D/3D, gạt sang 2D rồi F5 vẫn ở 2D và tab Network không tải chunk `FantasyLibrary3D`; bật Device Mode (`pointer: coarse`) → ẩn công tắc, 0 chunk 3D; bật `prefers-reduced-motion: reduce` (sau khi xoá key `localStorage`) → mặc định 2D; chặn URL `*FantasyLibrary3D*` → tự rơi về `Library2DView` + toast.

---

#### Sub-phase 4A.2 — Lõi 3D thuần: Bố cục Kệ, Bộ nhớ đệm Texture bìa & Vật liệu Procedural
- **Thuộc:** **PR 4A** (`feat/library-3d`) — Commit dự kiến: `feat(3d): add shelf layout math, LRU createImageBitmap cover cache, and procedural materials`
- **Mục tiêu:** Xây dựng toàn bộ tầng logic và quản lý tài nguyên WebGL/VRAM trước khi dựng `<Canvas>`, bảo đảm không có CDN ngoài, không rò rỉ `ObjectURL`/`ImageBitmap`/`Texture`.
- **File tạo mới:**
  1. `src/components/library3d/layout3d.ts` (~190 dòng): tính toạ độ 3D chuẩn hoá cho các kệ (`ShelfLayout3D`) và từng cuốn sách (`BookSlot3D`) từ `ShelfGroup[]` (kích thước gáy biến thiên tự nhiên theo hash + `file_size`, chia tầng khi 1 kệ nhiều cuốn như bộ 41 cuốn SAO, hàm `getVisibleShelfWindow(cameraX, layouts, radius = 2)` cho windowing tầm nhìn).
  2. `src/components/library3d/coverTextureCache.ts` (~200 dòng): quản lý texture bìa với `fetchCoverBlobCached` hiện có, `MAX_COVER_TEXTURES = 36` (LRU), `MAX_CONCURRENT_COVER_LOADS = 4`, huỷ request khi kệ rời tầm nhìn, decode qua `createImageBitmap(blob, { imageOrientation: 'flipY', resizeWidth: 256, resizeHeight: 384, resizeQuality: 'medium' })` (fallback an toàn + revoke ngay `ObjectURL` nếu phải fallback), giải phóng bắt buộc `texture.dispose()` + `bitmap.close()` khi evict và `disposeAll()`.
  3. `src/components/library3d/proceduralMaterials.ts` (~165 dòng): tạo procedural Canvas2D textures (vân gỗ, mặt giấy, biển tên kệ dùng font hệ thống — 0 CDN) và cấu hình màu sắc/ánh sáng tương ứng 3 chế độ `light` / `dim` / `midnight`, có hàm `dispose()` thu hồi toàn bộ texture/material.
- **File sửa:**
  4. `docs/ARCHITECTURE.md` & `HANDOFF.md`.
- **Rủi ro & giảm thiểu:**
  - *Cảnh báo WebGL `flipY` khi dùng `ImageBitmap` với Three.js r169:* đặt `imageOrientation: 'flipY'` lúc tạo `ImageBitmap` kết hợp `texture.flipY = false` (và fallback kiểm tra UV nếu Safari bỏ qua option).
  - *Tăng đột biến RAM khi cuộn nhanh qua 40 kệ:* hàng đợi concurrency 4 + huỷ task ngoài tầm nhìn + LRU evict gọi ngay `bitmap.close()` & `texture.dispose()`.
- **Cách hoàn tác:** `git revert <commit-4A.2>`.
- **Cách test nhanh:**
  - `npm run typecheck && npm run lint && npm run build`.
  - Xác nhận chưa import 3 file mới vào entry chính → `index-*.js` không đổi 1 byte nào.

---

#### Sub-phase 4A.3 — Cảnh WebGL `FantasyLibrary3D` (`frameloop="demand"`, `InstancedMesh`, `CameraRig`)
- **Thuộc:** **PR 4A** (`feat/library-3d`) — Commit dự kiến: `feat(3d): build demand-rendered WebGL scene with instanced books and camera rig`
- **Mục tiêu:** Dựng không gian thư viện 3D thực sự chạy mượt ở `frameloop="demand"`, draw calls cố định bằng `InstancedMesh`, ánh sáng đồng bộ 3 theme, xử lý `webglcontextlost` & `document.hidden`, dừng render khi `paused`.
- **File tạo mới:**
  1. `src/components/library3d/LibraryRoomMesh.tsx` (~175 dòng): dựng khung kệ gỗ, sàn/tường ấm tối giản (merged/instanced `<= 8` draw calls), biển tên kệ procedural, ánh sáng Three.js thuần theo `theme` (`light`/`dim`/`midnight`), không dùng `drei` `Environment preset` hay `Text`.
  2. `src/components/library3d/InstancedBooksMesh.tsx` (~250 dòng): 3 `InstancedMesh` (gáy sách, ruột giấy, viền trang trí = 3 draw calls cố định cho mọi số lượng sách), xử lý pointer hover / click / multi-select highlight, hoạt ảnh rút nhẹ cuốn sách đang hover/chọn có điểm dừng epsilon, và lớp mặt bìa (`CoverPlane`) **giới hạn cứng `<= 20–24` slot tiêu điểm cùng lúc** (ưu tiên các cuốn gần tâm camera / đang hover / đang chọn trong `visibleShelfKeys`, các cuốn còn lại vẽ bằng 3 `InstancedMesh` để không vượt `45 draw calls` & `36` LRU textures trên kệ 41+ cuốn như bộ SAO).
  3. `src/components/library3d/CameraRig.tsx` (~165 dòng): điều hướng trượt dọc hành lang kệ (kéo chuột, lăn con lăn chuột, phím mũi tên/A-D, nhảy nhanh tới kệ từ bộ lọc), dùng `invalidate()` có điều kiện và tự dừng khi vận tốc `< 1e-3`, tôn trọng `prefers-reduced-motion`, báo `onVisibleShelvesChange`.
  4. `src/components/library3d/LibraryCanvas.tsx` (~145 dòng): bọc `<Canvas frameloop="demand" dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true }}>`, xử lý `webglcontextlost` / `webglcontextrestored` (tự fallback về 2D nếu không khôi phục), xử lý `visibilitychange` và prop `paused` (chặn `invalidate()` + tắt tương tác khi ẩn tab hoặc đang đọc), dọn sạch tài nguyên khi unmount.
- **File sửa:**
  5. `src/components/library3d/FantasyLibrary3D.tsx` (~120 dòng): gắn `LibraryCanvas` vào thay cho placeholder, nối `coverTextureCache.disposeAll()` khi unmount.
  6. `docs/ARCHITECTURE.md` & `HANDOFF.md`.
- **Rủi ro & giảm thiểu:**
  - *Chunk `three` + `fiber` bị kéo lọt vào `index-*.js`:* mọi import `three` / `@react-three/fiber` chỉ tồn tại bên trong `src/components/library3d/*`, được nạp duy nhất qua `React.lazy` ở `Library3DHost.tsx`. Kiểm chứng ngay bằng output `npm run build`!
  - *`drei` kéo theo gói thừa (`troika`, `hls.js`, `three-stdlib` đầy đủ):* ưu tiên Three.js + `@react-three/fiber` thuần cho `LibraryRoomMesh`/`InstancedBooksMesh`/`CameraRig`; nếu cần helper từ `drei` chỉ import subpath cụ thể và kiểm tra kích thước chunk ngay sau build.
  - *GPU chạy liên tục khi đứng yên:* đặt `frameloop="demand"` cứng trên `<Canvas>`, kiểm tra điều kiện dừng epsilon trong mọi `useFrame`.
- **Cách hoàn tác:** `git revert <commit-4A.3>`.
- **Cách test nhanh:**
  - `npm run typecheck && npm run lint && npm run build`: kiểm tra `index-*.js <= 86.04 kB gzip`, chunk 3D lazy `<= 240 kB gzip`, 0 cảnh báo ngoài ngoại lệ duy nhất chunk `three`/`pdfjs` (`0` cảnh báo `sax`).
  - Mở `npm run preview -- --port 5173 --strictPort`: vào 3D, kéo/cuộn dọc các kệ, đổi 3 theme `light`/`dim`/`midnight`, kiểm tra DevTools Frame Rendering Stats = 0 fps khi đứng yên, kiểm tra `gl.info.render.calls <= 45`.

---

#### Sub-phase 4A.4 — HTML Overlay đầy đủ, Nối 5 Modal & Kiểm định toàn diện PR 4A
- **Thuộc:** **PR 4A** (`feat/library-3d`) — Commit dự kiến: `feat(3d): add interactive HTML overlay, inspect card, and complete PR 4A verification`
- **Mục tiêu:** Hoàn thiện toàn bộ tương tác người dùng trong 3D bằng HTML overlay dùng chung state `App.tsx`, hỗ trợ đầy đủ tìm kiếm, lọc kệ, chọn nhiều + chuyển kệ hàng loạt, cả 5 modal, mở sách bằng `ReaderView` hiện có, và hoàn tất kiểm định để merge **PR 4A** độc lập vào `main`.
- **File tạo mới:**
  1. `src/components/library3d/BookInspectCard.tsx` (~130 dòng): thẻ xem nhanh cuốn sách đang chọn/hover trên kệ (hiển thị ảnh bìa gốc qua `useCoverUrl`, tiêu đề, tác giả, tên kệ, badge định dạng, thanh tiến độ %, nút **"Đọc sách"** gọi `onOpenBook`, nút **"Sửa"** gọi `onEditBook`, nút **"Chọn / Bỏ chọn"** khi ở `selectionMode`, nút đóng thẻ).
  2. `src/components/library3d/Library3DOverlay.tsx` (~260 dòng): lớp phủ HTML (`pointer-events-none` khung ngoài, `pointer-events-auto` trên các bảng điều khiển) gồm:
     - `LibraryHeader` (tái sử dụng 100%, đã có `ViewModeToggle` về 2D, thanh dung lượng, tải sách, chọn nhiều, đổi theme, làm mới, đăng xuất);
     - Thanh tìm kiếm + dải chips kệ (chọn để lọc/bay camera tới kệ + nút "Đổi tên kệ" gọi `onRenameShelf`);
     - Thanh công cụ `selectionMode` (`Chọn tất cả`, `Chuyển kệ (N)` → `BulkShelfModal`, `Xoá đã chọn (N)` → `DeleteConfirmModal`, `Xong`);
     - Thanh rút gọn **"Tiếp tục đọc"** ở góc dưới (thu gọn/mở rộng để không che cảnh 3D);
     - Trạng thái thư viện trống (nút "Tải sách đầu tiên") và trạng thái không tìm thấy kết quả lọc (nút "Xoá lọc").
- **File sửa:**
  3. `src/components/library3d/FantasyLibrary3D.tsx` (~160 dòng): kết nối `LibraryCanvas` + `Library3DOverlay` + `BookInspectCard`, đồng bộ nhảy camera khi người dùng chọn chip kệ hoặc tìm kiếm.
  4. `docs/ARCHITECTURE.md`, `docs/plans/phase-4-3d.md` (điền số đo bundle thực tế PR 4A), và `HANDOFF.md`.
- **Rủi ro & giảm thiểu:**
  - *HTML overlay chặn sự kiện kéo/cuộn trên Canvas 3D:* mọi vùng trống của overlay dùng `pointer-events-none`, chỉ đặt `pointer-events-auto` đúng trên thanh/thẻ nút bấm.
  - *Modal bị che bởi Canvas hoặc overlay:* 5 modal hiện tại ở `App.tsx` dùng **`z-40`** (`ToastContainer` dùng **`z-50`**), nên `Library3DOverlay` bắt buộc giới hạn tối đa **`z-20`** (Header **`z-30`**).
- **Cách hoàn tác:** `git revert <commit-4A.4>`.
- **Cách test nhanh:**
  - Chạy toàn bộ Checklist PR 4A ở Mục 7 (PC Chrome/Edge, laptop cảm ứng, DevTools `pointer: coarse`, điện thoại thật, `--disable-gpu`, `prefers-reduced-motion`, Network check, Memory `renderer.info.memory` sau 10 lần mở/đóng `ReaderView` & cuộn qua lại các kệ, mở đủ 5 modal từ 3D).
  - Mở **PR 4A (`feat/library-3d` → `main`)**, chờ CI xanh và merge vào `main` trước khi bắt đầu Phần B.

---

### PHẦN B — PR 4B: Nhánh `feat/book-spread-reader` *(Tách từ `main` SAU KHI PR 4A merge)*

#### Sub-phase 4B.1 — Ánh xạ Tiến độ (`spreadProgress.ts`) & Hook Phân trang 2 cột (`useSpreadPagination.ts`)
- **Thuộc:** **PR 4B** (`feat/book-spread-reader`) — Commit dự kiến: `feat(reader): add spread progress mapping and multi-column pagination hook`
- **Mục tiêu:** Cài đặt phần toán học đồng bộ tiến độ (không đổi schema D1) và engine phân trang CSS Multi-column tự tính lại khi đổi cỡ chữ, giãn dòng, kiểu chữ, độ rộng, kích thước cửa sổ, và khi ảnh nạp xong.
- **File tạo mới:**
  1. `src/lib/spreadProgress.ts` (~80 dòng):
     - `spreadToScrollRatio(spreadIndex, spreadsInChapter)`: `spreadIndex / Math.max(1, spreadsInChapter - 1)`.
     - `scrollRatioToSpread(scrollRatio, spreadsInChapter)`: `Math.round(clamped * Math.max(0, spreadsInChapter - 1))`.
     - `buildSpreadProgress(...)`: tạo đối tượng `ReadingProgress` đầy đủ (`chapterId`, `chapterIndex`, `chapterTitle`, `totalChapters`, `scrollRatio`, `scrollTop: 0`, `completed`, `updatedAt`).
     - `computeOverallReadingPercent(...)`: tính `%` tổng cuốn sách nhất quán với `ReaderView` & `BookCard`.
  2. `src/hooks/useSpreadPagination.ts` (~190 dòng):
     - Theo dõi kích thước khung đọc qua `ResizeObserver` (debounce ~80ms) và tính `colWidth` (làm tròn số nguyên), `colGap`, `spreadStride` chống lệch tích luỹ sub-pixel;
     - Đo `scrollWidth` để suy ra `totalColumns` và `spreadsInChapter = Math.max(1, Math.ceil(totalColumns / 2))`;
     - Kích hoạt re-measure khi đổi `chapter.id`, `settings` (`fontSizePx`, `lineHeight`, `font`, `width`), kích thước cửa sổ, và ảnh nạp xong (đổi `img.loading = 'eager'` trong DOM chương hiện tại + gắn listener `load`/`error` kèm cleanup);
     - Bảo toàn vị trí đọc theo `anchorRatioRef` khi re-paginate; hỗ trợ mở ở cuối chương (`openAtEnd = true`) khi người dùng lùi từ chương sau về chương trước.
- **File sửa:**
  3. `docs/ARCHITECTURE.md` & `HANDOFF.md`.
- **Rủi ro & giảm thiểu:**
  - *Ảnh `loading="lazy"` không giải mã ở cột ngoài màn hình dẫn đến sai tổng số spread:* chủ động đổi `img.loading = 'eager'` trong phạm vi DOM chương hiện tại + nghe `load`/`error` để re-measure ngay.
  - *Lệch sub-pixel ở chương dài 40+ trang:* làm tròn `colWidth = Math.floor((viewportWidth - colGap) / 2)` và căn `viewportWidth = colWidth * 2 + colGap` chẵn pixel tuyệt đối.
- **Cách hoàn tác:** `git revert <commit-4B.1>`.
- **Cách test nhanh:**
  - `npm run typecheck && npm run lint && npm run build`.
  - Kiểm chứng nhanh công thức biên cho `spreadsInChapter = 1`, `2`, `5`, `20` và các giá trị `scrollRatio = 0`, `0.25`, `0.5`, `1`.

---

#### Sub-phase 4B.2 — Giao diện Sách Mở Đôi 2 trang (`BookSpreadReader` + `BookSpreadChrome`)
- **Thuộc:** **PR 4B** (`feat/book-spread-reader`) — Commit dự kiến: `feat(reader): implement HTML/CSS two-page BookSpreadReader component`
- **Mục tiêu:** Dựng trình đọc sách mở đôi 2 trang bằng HTML/CSS (chữ DOM thật, gáy sách, mép giấy xếp chồng, 4 bảng màu đọc, lật trang phím/chạm lề/nút, dùng lại `ReaderSettingsPopover` và `ReaderTocDrawer`).
- **File tạo mới:**
  1. `src/components/reader/BookSpreadChrome.tsx` (~155 dòng): thanh điều khiển mảnh phía trên và chân trang (nút Quay lại 3D, mở Mục lục, tiêu đề sách + chương + `%`, badge `Cache 0ms / R2 Ready`, nút **"Đọc toàn màn hình"**, nút Tùy chỉnh `ReaderSettingsPopover`, số trang trong chương `Trang 3–4 / 12` + thanh tiến độ mảnh).
  2. `src/components/reader/BookSpreadReader.tsx` (~340 dòng):
     - Khung sách bìa cứng nổi giữa màn hình: gáy giữa có bóng đổ chiều sâu, mép giấy xếp tầng hai bên, áp dụng `READER_THEME_STYLES[settings.theme]` và `READER_FONT_CLASS[settings.font]`;
     - **Chốt cấu trúc DOM:** dùng khung viewport ngoài cố định kích thước (`overflow-hidden`) bọc track nội bộ CSS Multi-column dịch chuyển (`translateX`) để đo `track.scrollWidth` chính xác tuyệt đối không bị lệch;
     - Render DOM thật từ `currentChapter.content_html` đã sanitize bởi `DOMPurify` (hoặc tách đoạn `currentChapter.content`), **0 đường `innerHTML` mới chưa sanitize**;
     - Dùng `useSpreadPagination` + `spreadProgress.ts`; debounce lưu tiến độ `600ms`, flush ngay khi đổi chương / đạt `completed` / chuyển toàn màn hình / đóng sách / unmount;
     - Điều hướng lật trái/phải qua phím (`ArrowLeft`/`ArrowRight`/`PageUp`/`PageDown`/`Space`/`Escape`, bỏ qua khi nhập liệu), chạm/nhấn lề trái/phải (tôn trọng `settings.sideTapNavigation`, bỏ qua khi bôi đen text hoặc bấm nút/link), nút hai bên lề;
     - Hiệu ứng chuyển trang mượt nhẹ (tắt chuyển động khi `prefers-reduced-motion: reduce`);
     - Nút **"Hoàn thành cuốn này!"** ở spread cuối của chương cuối;
     - Tái sử dụng trực tiếp `<ReaderSettingsPopover />` và `<ReaderTocDrawer />`.
- **File sửa:**
  3. `src/index.css` (~+55 dòng): thêm utility CSS cho `.book-spread-columns`, `.book-spread-spine`, `.book-spread-edge`, quy tắc ảnh trong spread (`max-height`, `object-fit: contain`, `break-inside: avoid`), `overflow-wrap: anywhere` chống bảng/URL dài làm vỡ cột, và `@media (prefers-reduced-motion: reduce)`.
  4. `docs/ARCHITECTURE.md` & `HANDOFF.md`.
- **Rủi ro & giảm thiểu:**
  - *Ảnh minh hoạ quá cao hoặc bảng quá rộng phá cấu trúc 2 cột:* ép `img, svg, table { max-width: 100%; break-inside: avoid; }` và `img { max-height: calc(var(--spread-page-h) - 2rem); width: auto; height: auto; }`.
  - *File `BookSpreadReader.tsx` vượt trần 500 dòng:* đã tách `BookSpreadChrome.tsx` (~155 dòng), `useSpreadPagination.ts` (~190 dòng) và `spreadProgress.ts` (~80 dòng) giúp `BookSpreadReader.tsx` gọn ~340 dòng.
- **Cách hoàn tác:** `git revert <commit-4B.2>`.
- **Cách test nhanh:**
  - `npm run typecheck && npm run lint && npm run build`.

---

#### Sub-phase 4B.3 — Tích hợp 3D Nền mờ + Dừng render, Chuyển tức thì `ReaderView` & Kiểm định PR 4B
- **Thuộc:** **PR 4B** (`feat/book-spread-reader`) — Commit dự kiến: `feat(reader): integrate BookSpreadReader over paused 3D library with instant fullscreen switch`
- **Mục tiêu:** Nối `BookSpreadReader` (qua `React.lazy`) vào `App.tsx` khi mở EPUB/DOCX từ 3D, làm mờ và dừng hẳn render cảnh 3D phía sau, hỗ trợ chuyển tức thì giữa `BookSpreadReader` ↔ `ReaderView` giữ nguyên vị trí, tự chuyển sang `ReaderView` nếu thu nhỏ cửa sổ `< 1024px`, và hoàn tất kiểm thử chéo PC 3D ↔ Mobile 2D.
- **File sửa:**
  1. `src/App.tsx` (~270 dòng):
     - Khai báo `const LazyBookSpreadReader = lazy(() => import('@/components/reader/BookSpreadReader').then((m) => ({ default: m.BookSpreadReader })));`.
     - Thêm state `readerPresentation: 'spread' | 'fullscreen'`. Khi gọi `openBook(book)` từ 3D và `book.file_type` hỗ trợ spread (`epub` / `docx`, theo `D-009` & `D-012`) → đặt `'spread'`; ngược lại (`pdf` hoặc mở từ 2D) → đặt `'fullscreen'`.
     - Khi đang mở sách ở chế độ `'spread'` và `effectiveMode === '3d'`:
       - Giữ `<Library3DHost ... paused={true} dimmed={true} />` phía sau (dừng render GPU & vô hiệu hoá tương tác canvas, làm mờ nhẹ);
       - Render `<ErrorBoundary fallback={/* rơi ngay về ReaderView toàn màn hình */}><Suspense ...><LazyBookSpreadReader ... onSwitchToFullscreen={...} /></Suspense></ErrorBoundary>` nổi phía trên.
     - Nếu giữa lúc đọc `'spread'` mà `effectiveMode` rơi về `'2d'` (ví dụ thu nhỏ cửa sổ `< 1024px`) → tự chuyển sang `ReaderView` toàn màn hình tại đúng `progress[activeBook.id]`.
  2. `src/components/Library3DHost.tsx` (~105 dòng) & `src/components/library3d/FantasyLibrary3D.tsx` (~170 dòng): truyền prop `paused` và `dimmed` xuống `LibraryCanvas` + ẩn bớt tương tác overlay khi đang mở sách.
  3. `src/components/ReaderView.tsx` (~460 dòng, dưới trần 500): thêm prop tuỳ chọn `onSwitchToSpread?: () => void` (hiện nút nhỏ "Sách mở đôi" trên header khi mở EPUB/DOCX từ 3D để quay lại spread nhanh).
  4. `docs/ARCHITECTURE.md`, `docs/plans/phase-4-3d.md` (điền số đo bundle thực tế PR 4B), và `HANDOFF.md`.
- **Rủi ro & giảm thiểu:**
  - *Chunk `BookSpreadReader` bị lỗi mạng hoặc 404 sau deploy:* bọc trong `ErrorBoundary` có `fallback` tự chuyển thẳng sang `ReaderView` toàn màn hình (không mất sách đang mở) + `recoverFromChunkError`.
  - *Cảnh 3D vẫn ngốn GPU phía sau `BookSpreadReader`:* `paused={true}` chặn mọi lệnh `invalidate()` trong `LibraryCanvas`, và `backdrop-blur`/CSS `blur` áp lên khung tĩnh nên GPU hoàn toàn rảnh (`0 FPS`).
- **Cách hoàn tác:** `git revert <commit-4B.3>`.
- **Cách test nhanh:**
  - Chạy toàn bộ Checklist PR 4B ở Mục 7, đặc biệt kiểm thử chéo 2 chiều PC 3D (`BookSpreadReader`) ↔ Mobile 2D (`ReaderView`), đo `renderer.info.memory` sau 10 lần mở/đóng `BookSpreadReader`, kiểm tra ngân sách bundle.
  - Mở **PR 4B (`feat/book-spread-reader` → `main`)**, chờ CI xanh và merge.

---

## 4. Quyết định đã chốt (`AGENTS.md` §4)

> Cả 5 quyết định bên dưới đã được người dùng phê duyệt (**Phương án A** cho toàn bộ QĐ-4.1 → QĐ-4.5) và ghi chính thức vào `docs/DECISIONS.md` từ **`D-010` → `D-014`** (đồng bộ với `D-009` đã loại bỏ MOBI/CBZ và thêm DOCX).

### QĐ-4.1 (`D-010` — Đã chốt Phương án A) — Phong cách cảnh 3D & Nguồn Asset (PR 4A)

| Phương án | Mô tả | Rủi ro | Công sức | Khả năng hoàn tác |
|---|---|---|---|---|
| **A (Khuyến nghị): Thư phòng gỗ ấm 100% Procedural** | Dựng tủ kệ chạy dọc không gian bằng geometry + texture Canvas2D (vân gỗ, mặt giấy, biển kệ dùng font hệ thống) + đèn Three.js thuần đồng bộ 3 theme (`light`/`dim`/`midnight`). **0 asset bên ngoài, 0 CDN.** | **Thấp** (nhẹ, kiểm soát chặt draw calls/VRAM, không dính bản quyền hay mạng) | Trung bình | Rất dễ |
| **B: Thư viện Fantasy cổ điển dùng `.glb` + HDRI tự host trong `public/3d/`** | Tự tìm/dựng model tủ chạm khắc, nến, thảm, đèn chùm (`.glb` nén Draco) + HDRI lưu trong `public/3d/`. | **Trung bình–Cao** (phình repo 3–10 MB, cần Draco decoder, khó đồng bộ 3 theme sáng/tối/đêm khuya và dễ vượt ngân sách draw calls) | Cao | Trung bình |
| **C: Lai (Khung kệ Procedural + 1–2 vật trang trí `.glb` < 200 kB tự host)** | Khung kệ & sách procedural như A, bổ sung thêm vài đồ trang trí nhỏ `.glb` tự host sau. | Trung bình (thêm bước load GLTF & dispose) | Trung bình–Cao | Dễ (tách layer decor riêng) |

- **Khuyến nghị:** **Phương án A** cho PR 4A (nhanh, sạch, 0 CDN, đồng bộ 3 chế độ màu có sẵn của Ofu's Library; giữ kiến trúc mở để gắn decor nhẹ theo hướng C sau nếu cần).
- **Điểm yếu của phương án khuyến nghị:** Chi tiết trang trí kiến trúc (điêu khắc gỗ, đèn chùm, bàn ghế cầu kỳ) tối giản hơn so với phòng 3D dựng sẵn từ Blender.

---

### QĐ-4.2 (`D-011` — Đã chốt Phương án A) — Cách chia trang cho `BookSpreadReader` (PR 4B)

| Phương án | Mô tả | Rủi ro | Công sức | Khả năng hoàn tác |
|---|---|---|---|---|
| **A (Đã chốt `D-011`): CSS Multi-column + khung ngoài `overflow-hidden` bọc track nội bộ + `ResizeObserver` & image-load re-measure** | Dùng khung ngoài `overflow-hidden` bọc track nội bộ đặt `column-width` chẵn pixel, `column-gap`, `column-fill: auto`, dịch track theo `spreadStride = 2 × (colWidth + colGap)` để không lệch `scrollWidth`. Chủ động đổi `img.loading = 'eager'` trong chương hiện tại và tính lại khi đổi cài đặt / resize / ảnh nạp xong. | **Thấp–Trung bình** (cần xử lý chặt làm tròn pixel chống lệch sub-pixel, `max-height` ảnh và `overflow-wrap` cho bảng/link dài) | Trung bình | Dễ |
| **B: Tự đo nội dung & tách cây DOM thành từng trang bằng JS (`Range` / `offsetHeight`)** | Duyệt từng phần tử DOM, đo chiều cao và tách text node vào mảng trang trái/phải. | **Cao** (rất dễ vỡ HTML lồng phức tạp của EPUB/DOCX, tốn CPU 50–300ms khi đổi cỡ chữ trên chương dài, code phức tạp dễ chạm trần 500 dòng) | Rất cao | Trung bình |
| **C: Hai khung cuộn dọc giả lập 2 trang** | Không chia trang thực sự, chỉ hiển thị giao diện trang giấy có thanh cuộn dọc. | Trung bình (không mang lại trải nghiệm lật trang sách thật) | Thấp | Dễ |

- **Đã chốt:** **Phương án A** (`D-011`).
- **Điểm yếu của phương án đã chốt:** Chỉ hỗ trợ hiệu ứng lật/trượt/mờ 2D–2.5D nhẹ (khó làm hiệu ứng cong tờ giấy 3D thật); một số sách có bảng `<table>` rộng đặc biệt có thể cần thu nhỏ hoặc cuộn cục bộ bên trong bảng để không đẩy tràn cột.

---

### QĐ-4.3 (`D-012` — Đã chốt Phương án A, đồng bộ `D-009`) — Phạm vi định dạng trong `BookSpreadReader` (PR 4B)

| Phương án | Mô tả | Rủi ro | Công sức | Khả năng hoàn tác |
|---|---|---|---|---|
| **A (Đã chốt `D-012`): `EPUB` & `DOCX` mở bằng `BookSpreadReader`; `PDF` luôn mở bằng `ReaderView` / `PdfReader`** | Đồng bộ `D-009` (chỉ còn 3 định dạng `epub`, `pdf`, `docx`; đã xoá sạch `mobi` và `cbz`). Toàn bộ sách chữ reflowable (`epub`, `docx`) dùng chung `BookSpreadReader`; `pdf` giữ nguyên `ReaderView` / `PdfReader`. | **Rất thấp** (0 thay đổi `parsers.ts`, không còn ngoại lệ CBZ/MOBI) | Rất thấp | Rất dễ |
| **B: Ép PDF vào khung 2 cột spread CSS** | Render trang PDF vào khung spread. | **Cao** (PDF có bố cục trang cố định, cần zoom/pan canvas riêng của `PdfReader`) | Cao | Trung bình |

- **Đã chốt:** **Phương án A** (`D-012`).
- **Điểm yếu của phương án đã chốt:** Khi mở tài liệu PDF từ Thư viện 3D, màn hình chuyển sang `ReaderView` / `PdfReader` toàn màn hình thay vì sách mở đôi nổi trên nền 3D mờ.

---

### QĐ-4.4 (`D-013` — Đã chốt Phương án A) — Ngân sách Hiệu năng (PR 4A & PR 4B)

| Phương án | Thông số chính | Rủi ro | Công sức | Khả năng hoàn tác |
|---|---|---|---|---|
| **A (Đã chốt `D-013`): Cân bằng, tối ưu laptop GPU tích hợp** | Tương tác `60 FPS` (`>= 45 FPS` iGPU), idle **`0 FPS`**; draw calls **`<= 45`** (giới hạn cứng `CoverPlane <= 20–24` slot tiêu điểm, còn lại vẽ bằng 3 `InstancedMesh`); VRAM **`<= 40` textures** (`<= 36` bìa LRU decode `256×384` + `<= 4` procedural, ~20–30 MB VRAM), song song `<= 4` tải; chunk 3D **`<= 240 kB gzip`**; entry `index-*.js` **`<= 86.04 kB gzip`**. | **Thấp** (ổn định nhiệt/pin trên cả laptop văn phòng không có GPU rời) | Trung bình | Rất dễ (chỉnh hằng số) |
| **B: Đồ hoạ cao tối đa** | Bìa giữ nguyên `480×720`, LRU `80` textures (~120 MB VRAM), bật shadow map động `2048px` & post-processing bloom. | **Cao** (giật trên iGPU, tốn VRAM/pin, phình chunk 3D thêm 50–80 kB gzip) | Cao | Trung bình |
| **C: Siêu tối giản (không nạp bìa 3D)** | Chỉ vẽ gáy sách màu phẳng, LRU = 0, chỉ xem bìa ở HTML card khi hover. | Thấp về GPU nhưng giảm mạnh sức hút trực quan của thư viện 3D | Thấp | Dễ |

- **Đã chốt:** **Phương án A** (`D-013`).
- **Điểm yếu của phương án đã chốt:** Bìa hiển thị trực tiếp trên kệ 3D ở độ phân giải `256×384` và giới hạn tối đa `20–24` slot `CoverPlane` tiêu điểm cùng lúc (nhưng `BookInspectCard` HTML overlay luôn hiển thị ảnh gốc sắc nét cho bất kỳ cuốn nào được chọn).

---

### QĐ-4.5 (`D-014` — Đã chốt Phương án A) — Số sách tối đa cần chạy mượt (Capacity Target)

| Phương án | Mục tiêu quy mô | Rủi ro | Công sức | Khả năng hoàn tác |
|---|---|---|---|---|
| **A (Khuyến nghị): Mượt tuyệt đối đến `500` cuốn (~50 kệ), ổn định tới `1.000` cuốn** | `InstancedMesh` cấp phát động (hỗ trợ an toàn đến `2.000` instance) kết hợp windowing kệ theo tầm nhìn camera (`± 2` kệ) + bộ lọc/tìm kiếm nhảy nhanh. Khớp thực tế hạn mức R2 9.0 GiB (D-002). | **Thấp** | Trung bình | Dễ |
| **B: Quy mô nhỏ `<= 150` cuốn** | Dựng 1 phòng cố định không có windowing kệ. | **Cao** (chỉ riêng bộ SAO đã 41 cuốn, sớm vượt ngưỡng 150 cuốn phải viết lại) | Thấp | Trung bình |
| **C: Quy mô cực lớn `5.000+` cuốn** | Chunked spatial index / virtualized instancing phức tạp. | Trung bình (over-engineering cho thư viện cá nhân 9.0 GiB, phình code) | Rất cao | Khó |

- **Khuyến nghị:** **Phương án A**.
- **Điểm yếu của phương án khuyến nghị:** Khi kho vượt quá `1.000` cuốn (chủ yếu file EPUB rất nhẹ < 1 MB), việc lướt tay liên tục qua hàng chục kệ sẽ dài nên người dùng nên dùng ô tìm kiếm hoặc chips lọc kệ để nhảy thẳng tới kệ cần tìm.

---

## 5. Quy tắc Build & Bảng Đo đạc Bundle

### Quy tắc bắt buộc cho cả PR 4A và PR 4B
1. `npm run typecheck`: **0 lỗi**.
2. `npm run lint`: **0 lỗi, 0 cảnh báo** (mọi file `.ts`/`.tsx` đều `<= 500` dòng hiệu dụng).
3. `npm run build`: **0 lỗi, 0 cảnh báo** (**0 cảnh báo `sax`** sau khi đã gỡ `@lingo-reader/mobi-parser` ở PR #4), với **ngoại lệ duy nhất**:
   - Cảnh báo `> 500 kB` nếu **chỉ** đến từ chunk tải lười của `pdfjs` hoặc `three` (phải ghi đầy đủ số đo raw/gzip vào bảng dưới; **CẤM tăng `build.chunkSizeWarningLimit`**).
4. **Trần chunk entry (`index-*.js`):** Baseline hiện tại trên `origin/main` (sau PR #4) là **`275.72 kB raw / 81.04 kB gzip`**. Sau PR 4A và sau PR 4B, chunk entry **không được vượt quá `86.04 kB gzip`** (chênh lệch tối đa **`+5.00 kB gzip`**).

### Bảng theo dõi số đo Bundle (điền số thực tế khi hoàn tất từng PR)

| Chunk / Asset | Baseline `origin/main` (sau PR #4) | Sau PR 4A (`feat/library-3d`) | Sau PR 4B (`feat/book-spread-reader`) | Giới hạn mục tiêu |
|---|---:|---:|---:|---|
| `index-*.js` (entry chính) | **275.72 kB** (**81.04 kB** gzip) | _(điền sau 4A.4)_ | _(điền sau 4B.3)_ | **`<= 86.04 kB gzip`** |
| `index-*.css` | 43.13 kB (8.60 kB gzip) | _(điền sau 4A.4)_ | _(điền sau 4B.3)_ | Ổn định |
| Chunk 3D (`FantasyLibrary3D` + `three` + `fiber`) | **0 kB** | _(điền sau 4A.4)_ | _(điền sau 4B.3)_ | Lazy only; tổng **`<= 240 kB gzip`** |
| Chunk `BookSpreadReader-*.js` | **0 kB** | **0 kB** | _(điền sau 4B.3)_ | Lazy only (0 byte trên mobile/2D) |
| `pdf-*.js` (`pdfjs-dist` lazy) | 483.15 kB (144.26 kB gzip) | _(điền sau 4A.4)_ | _(điền sau 4B.3)_ | Không đổi |

---

## 6. Tổng hợp Rủi ro & Cách Hoàn tác

| Rủi ro | Phạm vi | Mức độ | Biện pháp giảm thiểu | Cách hoàn tác |
|---|---|---|---|---|
| `three` / `@react-three/*` vô tình lọt vào entry `index-*.js` hoặc tải trên mobile/AuthGate | PR 4A | **Cao** | Chỉ import thư viện 3D trong `src/components/library3d/*`, nạp duy nhất qua `React.lazy` ở `Library3DHost.tsx` sau guard `useCanUse3D` + `authenticated`; xác minh bằng `npm run build` & DevTools Network | `git revert <commit-4A.3>` |
| Component `drei` âm thầm gọi CDN ngoài (`Environment`, `Text`/troika) | PR 4A | **Cao** | Cấm dùng `Environment preset` và `Text` font mặc định; tự dựng ánh sáng Three.js & biển kệ Canvas2D procedural; kiểm tra Network 0 request ngoài origin | `git revert <commit-4A.3>` |
| Rò rỉ VRAM / `ImageBitmap` / `ObjectURL` khi cuộn kệ hoặc mở/đóng sách nhiều lần | PR 4A & 4B | **Cao** | `coverTextureCache` dùng `createImageBitmap` + LRU cap 36 + gọi `texture.dispose()` và `bitmap.close()` khi evict/unmount; nếu fallback `ObjectURL` thì `revokeObjectURL` ngay trong `onload`/`onerror`; đo `renderer.info.memory` sau 10 chu kỳ mở/đóng | `git revert <commit-4A.2>` |
| Mất ngữ cảnh WebGL (`webglcontextlost`) hoặc chunk 3D 404/offline gây trắng trang | PR 4A | **Cao** | `ErrorBoundary` (prop `fallback`) + `recoverFromChunkError` (tự reload tối đa 1 lần khi stale chunk online) + fallback tức thì sang `Library2DView` + listener `webglcontextlost` | `git revert <commit-4A.1>` / `<commit-4A.3>` |
| Lệch cột sub-pixel hoặc ảnh EPUB bị cắt/chưa tải trong `BookSpreadReader` | PR 4B | **Trung bình** | Làm tròn nguyên `colWidth`, đổi `img.loading = 'eager'` trong chương hiện tại, gắn `ResizeObserver` + image `load`/`error` để re-paginate và giữ neo `scrollRatio`; ép `max-height` + `break-inside: avoid` | `git revert <commit-4B.1>` / `<commit-4B.2>` |
| Sai lệch vị trí đọc giữa PC 3D (`BookSpreadReader`) và điện thoại 2D (`ReaderView`) | PR 4B | **Trung bình** | Lưu theo `chapterId`/`chapterIndex` + `scrollRatio = spreadIndex / max(1, spreadsInChapter - 1)`, `scrollTop = 0`, bảo toàn `completed` một chiều; test chéo 2 chiều thực tế | `git revert <commit-4B.1>` |
| Phình file vượt trần 500 dòng của ESLint (`max-lines`) | PR 4A & 4B | **Thấp** | Chia rõ mỗi trách nhiệm 1 file (`layout3d`, `coverTextureCache`, `proceduralMaterials`, `LibraryRoomMesh`, `InstancedBooksMesh`, `CameraRig`, `LibraryCanvas`, `Library3DOverlay`, `BookInspectCard`, `spreadProgress`, `useSpreadPagination`, `BookSpreadChrome`, `BookSpreadReader`); ép kiểm tra bởi `npm run lint` ở mọi commit | Tách module ngay trong nhánh |

---

## 7. Checklist Kiểm thử Bắt buộc (Definition of Done)

> Chạy bản build production cục bộ bằng lệnh chuẩn khớp `APP_ORIGINS` của Worker:
> ```bash
> npm run build && npm run preview -- --port 5173 --strictPort
> ```

### 7A. Kiểm định tự động & Quy tắc Build (chạy cho cả PR 4A và PR 4B)
- [ ] `npm run typecheck` — 0 lỗi.
- [ ] `npm run lint` — 0 lỗi, 0 cảnh báo (mọi file `.ts`/`.tsx` đều `<= 500` dòng hiệu dụng).
- [ ] `npm run build` — 0 lỗi, 0 cảnh báo ngoài ngoại lệ duy nhất (chunk lazy `three`/`pdfjs` `> 500 kB` raw không tăng `chunkSizeWarningLimit`; **0 cảnh báo `sax`**).
- [ ] Chunk entry `index-*.js` **`<= 86.04 kB gzip`** (không vượt baseline `81.04 kB gzip` quá `5 kB gzip`).
- [ ] Tổng chunk 3D lazy **`<= 240 kB gzip`**; không sửa Worker / schema D1.

### 7B. Kiểm thử Ranh giới thiết bị D-008 & Chịu lỗi (PR 4A)
- [ ] **PC Chrome & Edge (`>= 1024px`, chuột/touchpad):** vào được 3D, thấy công tắc 2D/3D, gạt sang 2D → F5 vẫn giữ 2D (`localStorage`), gạt lại 3D → vào lại mượt.
- [ ] **Laptop cảm ứng (`>= 1024px`, có cả touchpad/chuột lẫn màn cảm ứng):** khớp `(hover: hover) and (pointer: fine)` → vào được 3D, thao tác chuột/bàn phím/công tắc 2D ổn định.
- [ ] **DevTools Device Mode (`pointer: coarse`):** kể cả khi đặt chiều rộng `>= 1024px` (như iPad cảm ứng không chuột), công tắc 2D/3D **ẩn hoàn toàn**, hiển thị 2D, không tạo WebGL context kiểm tra.
- [ ] **Điện thoại thật (iOS / Android):** luôn mở thẳng 2D, không hiện công tắc 3D, thao tác đọc/tải/chuyển kệ 2D mượt như trước.
- [ ] **Tắt WebGL hoặc khởi chạy trình duyệt với cờ `--disable-gpu`:** `failIfMajorPerformanceCaveat: true` loại bỏ software renderer → ẩn công tắc 3D, tự ở 2D, 0 màn hình lỗi.
- [ ] **`prefers-reduced-motion: reduce`:** xoá `ofu-library-view-mode` trong `localStorage`, bật `prefers-reduced-motion: reduce` rồi F5 → mặc định mở **2D** (công tắc 2D/3D vẫn hiện nếu đạt 3 điều kiện; nếu tự bật 3D thì giảm/tắt hoạt ảnh kéo dài).
- [ ] **Thu nhỏ cửa sổ giữa phiên (`< 1024px` → `>= 1024px`):** kéo cửa sổ xuống dưới `1024px` → chuyển mượt sang 2D (giữ nguyên từ khoá tìm kiếm, kệ lọc, danh sách chọn), không mount/unmount giật liên tục; kéo rộng lại `>= 1024px` → quay về 3D và tab Network **không tải lại chunk 3D**.
- [ ] **Fallback lỗi chunk 3D & WebGL context lost:**
  - Chặn URL chunk 3D trong DevTools (`Block request URL`) khi Online / Offline → tự quay về `Library2DView` + toast cảnh báo, **không bao giờ hiện màn hình lỗi toàn trang**.
  - Giả lập chunk cũ 404 sau deploy (sửa tạm 1 file 3D + build lại khi tab cũ đang mở Online) → tự reload đúng 1 lần qua `chunkReload.ts`, không lặp vô hạn.
  - Giả lập `webglcontextlost` (`WEBGL_lose_context`) không khôi phục → tự rơi về `Library2DView` + toast cảnh báo.

### 7C. Kiểm thử Network, 0 CDN ngoài, GPU & Bộ nhớ (PR 4A & lặp lại ở PR 4B)
- [ ] **Network — Trang đăng nhập (`AuthGate`):** 0 request tới chunk `three` / `@react-three/*` / `FantasyLibrary3D` / `BookSpreadReader`.
- [ ] **Network — Thư viện 2D:** (đã lưu `'2d'` trong `localStorage`, hoặc `prefers-reduced-motion` mặc định) F5 → 0 request tới chunk `three` / `@react-three/*` / `FantasyLibrary3D` / `BookSpreadReader`.
- [ ] **Network — Mobile / `pointer: coarse`:** 0 request tới chunk `three` / `@react-three/*` / `FantasyLibrary3D` / `BookSpreadReader`.
- [ ] **Network — 0 CDN ngoài trong 3D:** toàn bộ request khi mở 3D chỉ đi tới origin ứng dụng và Worker API (0 request tới `raw.githack.com`, `polyhaven`, `jsdelivr`, `fonts.gstatic`, v.v.).
- [ ] **GPU (`frameloop="demand"`):**
  - Đứng yên trong cảnh 3D → 0 frame render thừa (`0 FPS` idle);
  - Chuyển sang tab khác (`document.hidden`) hoặc đang mở sách (`BookSpreadReader`) → 0 frame render thừa;
  - `renderer.info.render.calls <= 45` kể cả với nhiều kệ / nhiều sách.
- [ ] **Memory (`renderer.info.memory` & `ObjectURL`):**
  - Ghi nhận `geometries` và `textures` lúc vừa ổn định trong 3D;
  - Thực hiện **10 lần mở/đóng sách** (tại PR 4A dùng `ReaderView`; tại PR 4B dùng `BookSpreadReader`) và **cuộn qua lại liên tục nhiều vòng qua toàn bộ các kệ**;
  - Xác nhận `renderer.info.memory.textures <= 40` trong suốt quá trình và cả `geometries` lẫn `textures` **trở về mức ổn định ban đầu** sau khi kết thúc;
  - Xác nhận không còn `ObjectURL` treo trong bộ nhớ (bìa 3D đi qua `createImageBitmap` + `bitmap.close()`; `ParsedBook.dispose()` chạy sạch khi đóng sách).

### 7D. Kiểm thử Tương tác Thư viện 3D dùng chung State (PR 4A)
- [ ] Tìm kiếm tên sách/tác giả/kệ (có dấu & không dấu), lọc kệ, đổi 3 chế độ màu (`light`/`dim`/`midnight`) hoạt động đồng nhất giữa 3D và 2D.
- [ ] Bật **Chọn nhiều** trong 3D → chọn sách / `Chọn tất cả` → mở **`BulkShelfModal`** chuyển kệ hàng loạt (xác nhận kệ 3D cập nhật ngay và tự thoát chế độ chọn nhiều).
- [ ] Mở và hoàn tất thử cả **5 modal** từ 3D: `UploadDropzone`, `BookEditModal`, `ShelfRenameModal`, `BulkShelfModal`, `DeleteConfirmModal` + kiểm tra `ToastContainer` hiển thị đúng trên lớp trên cùng.
- [ ] Mở sách từ 3D (PR 4A) → mở `ReaderView` hiện có (EPUB/DOCX/PDF), đóng sách quay lại đúng Thư viện 3D.

### 7E. Kiểm thử `BookSpreadReader` & Đồng bộ tiến độ chéo (PR 4B)
- [ ] Mở **EPUB** và **DOCX** từ 3D → cảnh 3D phía sau làm mờ và dừng render hoàn toàn; sách mở đôi 2 trang HTML/CSS (khung ngoài `overflow-hidden` bọc track nội bộ) hiện ở giữa (gáy, mép giấy, 4 theme đọc); chữ là DOM thật bôi đen/copy được.
- [ ] Mở **PDF** từ 3D → luôn mở bằng `ReaderView` / `PdfReader` hiện có (`D-012`).
- [ ] Lật trang bằng phím (`ArrowLeft`/`ArrowRight`, `PageUp`/`PageDown`, `Escape`), chạm lề trái/phải (bật/tắt theo `sideTapNavigation`), nút mũi tên; vượt biên tự chuyển chương đúng (về spread đầu chương sau / spread cuối chương trước).
- [ ] Đổi cỡ chữ, giãn dòng, kiểu chữ, độ rộng, kéo đổi kích thước cửa sổ, và mở chương nhiều ảnh minh hoạ → tự tính lại số spread, **giữ nguyên đúng đoạn đang đọc**, không cắt nửa chữ/ảnh.
- [ ] `ReaderSettingsPopover` và `ReaderTocDrawer` dùng lại hoạt động trơn tru trên `BookSpreadReader`.
- [ ] Bấm **"Đọc toàn màn hình"** → chuyển tức thì sang `ReaderView` tại đúng chương và vị trí (`scrollRatio`), không re-parse sách; thu nhỏ cửa sổ `< 1024px` khi đang đọc spread → tự chuyển sang `ReaderView` giữ nguyên vị trí.
- [ ] **Kiểm thử đồng bộ tiến độ chéo 2 chiều (PC 3D ↔ Điện thoại 2D):**
  - Đọc dở 1 cuốn EPUB/DOCX trên **PC 3D (`BookSpreadReader`)** (giữa chương X, ví dụ ~50%) → đóng/chờ đồng bộ → mở cùng cuốn trên **điện thoại thật 2D (`ReaderView`)** → mở đúng chương X ở ~50% chương.
  - Đọc tiếp tới ~75% chương Y trên **điện thoại thật 2D (`ReaderView`)** → mở lại trên **PC 3D (`BookSpreadReader`)** → mở đúng chương Y ở spread `round(0.75 × (spreadsInChapter - 1))`.
  - Đọc tới spread cuối chương cuối → xác nhận `completed = true` hiển thị đúng trên cả 2D và 3D, không bị reset về `false` khi lật lại chương trước.
