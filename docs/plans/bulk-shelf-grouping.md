# Kế hoạch Triển khai — Tự động gom kệ theo lô & Chuyển kệ hàng loạt (`feat/bulk-shelf-grouping`)

> **Trạng thái:** Đã hoàn tất triển khai Phase 1 → 4, đã deploy Worker live và vượt qua Checklist kiểm định tự động 4A & 4B — chờ người dùng kiểm thử thủ công 4C trước khi mở PR vào `main`.
> **Nhánh triển khai:** `feat/bulk-shelf-grouping` (tách mới từ `origin/main` sau khi PR #2 `refactor/code-splitting` đã merge; đã gỡ upstream tracking với `origin/main`).
> **Ràng buộc liên quan:** `AGENTS.md` (mọi file ≤ 500 dòng hiệu dụng, không commit/push trực tiếp lên `main`, tra "Công cụ đã có — cấm viết lại" trước khi thêm helper, cập nhật `HANDOFF.md` ở mọi commit và `docs/ARCHITECTURE.md` ở mọi commit đổi cấu trúc/API), `docs/DECISIONS.md` (`D-001` → `D-008`).

---

## 1. Bối cảnh & Mục tiêu

### Vấn đề hiện tại
1. **Chia nhỏ kệ khi tải nhiều tập cùng bộ có tên viết tắt / hậu tố biến thể:**
   - `extractSeriesName(title)` trong `src/lib/shelfPlacement.ts` hiện mới chỉ nhận diện các hậu tố có từ khoá rõ (`Vol`, `Tập`, `Quyển`, `Chương`, `Phần`, `Book`, `Part`, `#`) hoặc có dấu phân cách `- _ : |` đi kèm từ khoá.
   - Khi tải các bộ đặt tên ngắn gọn hoặc biến thể như `SAO1`, `SAO2`, `SAO3`, `SAOP1`, `SAO_IF`, `SAO_ALT`, hoặc `SAO (01)`, `SAO [01]`, `SAO v01`, `Tên truyện - 01`, hàm không nhận diện được tên bộ chung nên mỗi cuốn bị tách thành 1 kệ riêng (`SAO1`, `SAO2`, `SAOP1`...).
   - Trên `https://ofu.lol`, 41 quyển thuộc bộ **SAO** đã tải lên đang bị chia lẻ thành nhiều kệ nhỏ, trong khi giao diện chỉ mới có đổi tên từng kệ 1 (`ShelfRenameModal`) hoặc sửa từng cuốn (`BookEditModal`), chưa có công cụ gom kệ hàng loạt cho nhiều sách chọn cùng lúc.
2. **Thiếu chốt kiểm soát kệ chung ngay ở bước tải lên hàng loạt (`UploadDropzone`):**
   - Người dùng kéo-thả 1 lô sách cùng bộ vào hàng đợi nhưng chưa có nút tick / sửa nhanh tên kệ chung ở thanh footer để khóa cứng toàn bộ lô vào đúng 1 kệ mong muốn trước khi bấm `Tải lên (N)`.
3. **Các file chạm sát trần 500 dòng của ESLint (`max-lines`):**
   - `workers/r2-storage/src/index.ts`: **538 dòng tổng** (~478 dòng hiệu dụng).
   - `src/lib/api.ts`: **487 dòng tổng** (~438 dòng hiệu dụng).
   - `src/components/UploadDropzone.tsx`: **454 dòng tổng** (~418 dòng hiệu dụng).
   - Bắt buộc tách file theo trách nhiệm rõ ràng trước/trong khi thêm tính năng để không file nào vượt hoặc áp sát trần 500 dòng.

### Mục tiêu ("Định nghĩa xong")
1. **Worker (`workers/r2-storage/`)**:
   - Tách logic D1/R2 helper sang `workers/r2-storage/src/booksDb.ts` để cả `index.ts` và `booksDb.ts` đều gọn dưới 380 dòng.
   - Thêm endpoint `POST /api/books/bulk-shelf` (có `verifyAuth`, nhận `{ ids: string[], shelf: string }`, validate `ids` hợp lệ không rỗng và `shelf` sau `trim()` dài `1..120` ký tự, chia lô `<= 50` ID mỗi câu `UPDATE books SET shelf = ? WHERE id IN (...)` thực thi qua `env.DB.batch`, trả về `{ updatedIds, shelf }`).
   - Deploy Worker live (`cd workers/r2-storage && npm run deploy`) trước khi kiểm thử gom 41 cuốn SAO trên `https://ofu.lol`.
2. **Nhận diện bộ truyện & điểm chung hàng đợi (`src/lib/shelfPlacement.ts`)**:
   - Mở rộng `extractSeriesName(title)` nhận diện số tập dính liền chữ (`SAO1`, `SAO2`, `SAOP1`, `SAO 01`), số tập trong ngoặc/viết tắt (`SAO (01)`, `SAO [01]`, `SAO v01`, `SAO vol.1`, `Tên truyện - 01`).
   - Thêm `inferBatchCommonShelf(items, existingBooks)`: khi hàng đợi có `>= 2` tệp, tìm tên bộ / tiền tố gốc chung xuất hiện ở đa số (`>= 50%` và tối thiểu `2` tệp), chống gom nhầm các từ mở đầu vô nghĩa (`The`, `A`, `Tập`, `Quyển`, `Vol`, `Chương`...), và ưu tiên khớp tên kệ đã có trong `existingBooks` (không phân biệt hoa thường).
3. **Nút tick gom kệ ở footer `UploadDropzone.tsx` (`src/components/UploadBatchShelfBar.tsx`)**:
   - Đặt ở góc trái thanh footer của `UploadDropzone`, ngang hàng với nút `Đóng` và `Tải lên (N)`.
   - Khi hàng đợi có `>= 2` tệp (hoặc khi phát hiện `commonShelf`), hiển thị pill checkbox `Thêm vào kệ <Tên>` (mặc định **được tick chọn** khi `inferBatchCommonShelf` tìm thấy điểm chung; `<Tên>` dài tự `truncate` kèm `title` tooltip đầy đủ; có nút/ô sửa nhanh `<Tên>` ngay trên pill kèm `<datalist>` gợi ý kệ đang có).
   - Khi tick chọn: toàn bộ tệp active trong `UploadQueueList` hiển thị preview `Kệ: <Tên>`, và khi bấm `Tải lên (N)` sẽ truyền `shelfOverride = <Tên>` vào `uploadBook()` để ép toàn bộ lô vào đúng kệ đó. Khi bỏ tick: quay về phân kệ tự động theo từng cuốn.
4. **Chuyển kệ hàng loạt cho sách đã tải lên (`BulkShelfModal.tsx` + `Library2DView.tsx` + `App.tsx` + `src/lib/api.ts`)**:
   - Thêm `bulkUpdateBooksShelf(bookIds, targetShelf)` trong `src/lib/api.ts` (hỗ trợ cả Local-First IndexedDB và Cloud `POST /api/books/bulk-shelf`).
   - Trên thanh công cụ `Chọn nhiều` của `Library2DView.tsx`, thêm nút `Chuyển kệ (N)` cạnh nút `Xoá đã chọn (N)`; kết hợp với ô tìm kiếm (`SAO`) + `Chọn tất cả` để gom 41 cuốn SAO chỉ bằng 1 thao tác.
   - Tạo `src/components/BulkShelfModal.tsx` (ô nhập tên kệ có gợi ý thông minh + danh sách chips kệ hiện có để bấm chọn 1 chạm), cập nhật state `books`, hiện toast thành công và tự động thoát chế độ chọn nhiều.

---

## 2. Lộ trình triển khai theo từng Phase

> Tuân thủ `AGENTS.md` §7 & §8: mỗi phase là 1 commit nhỏ, sạch `typecheck` + `lint` + `build`, cập nhật `HANDOFF.md` ngay trong cùng commit (và cập nhật `docs/ARCHITECTURE.md` ở các phase có thêm module/API).

### Phase 1 — Tách `booksDb.ts` & thêm `POST /api/books/bulk-shelf` cho Cloudflare Worker

- **Mục tiêu:** Giảm kích thước `workers/r2-storage/src/index.ts` từ 538 dòng xuống ~330 dòng, tách các hàm truy vấn D1/R2 sang `workers/r2-storage/src/booksDb.ts`, và bổ sung endpoint `POST /api/books/bulk-shelf` an toàn với giới hạn bind parameter của Cloudflare D1.
- **File tạo mới:**
  1. **`workers/r2-storage/src/booksDb.ts`** (~210 dòng):
     - Định nghĩa và export các interface & hằng dùng chung của Worker: `Env`, `BookRow`, `ProgressRow`, `DEFAULT_HARD_LIMIT_BYTES`, `MAX_SINGLE_FILE_BYTES`, `MAX_COVER_BYTES`, `MAX_SHELF_NAME_LENGTH = 120`, `BULK_D1_CHUNK_SIZE = 50`, `ACCEPTED_FILE_TYPES`, `CONTENT_TYPES`.
     - Chứa các helper thuần & D1/R2 thao tác dữ liệu:
       - `getLimitBytes(env)`, `getStorageStats(env)`, `assertQuota(usedBytes, incomingBytes, limitBytes)`, `isValidId(id)`, `safeDecodeHeader(value, fallback)`.
       - `listBooksAndProgress(env)`: chạy `Promise.all` lấy `books`, `progressMap`, `storage`.
       - `deleteSingleBook(env, bookId)` và `bulkDeleteBooks(env, rawIds)` (chia lô truy vấn/xoá D1 theo `BULK_D1_CHUNK_SIZE = 50`).
       - **`bulkUpdateShelfInDb(env, rawIds, rawShelf)`**:
         - Lọc & khử trùng lặp `ids`: chỉ giữ các phần tử `typeof id === 'string' && isValidId(id)`. Nếu mảng rỗng → ném `new HttpError('Danh sách sách cần chuyển kệ trống.', 400)`.
         - Chuẩn hoá `shelf = typeof rawShelf === 'string' ? rawShelf.trim() : ''`. Nếu `!shelf || shelf.length > MAX_SHELF_NAME_LENGTH` (120 ký tự) → ném `new HttpError('Tên kệ sách không hợp lệ (tối đa 120 ký tự).', 400)`.
         - Chia `ids` thành từng lô tối đa **50 ID** (`BULK_D1_CHUNK_SIZE = 50`). Với mỗi lô `chunk`, tạo statement:
           ```ts
           const placeholders = chunk.map(() => '?').join(', ');
           env.DB.prepare(`UPDATE books SET shelf = ? WHERE id IN (${placeholders})`).bind(shelf, ...chunk)
           ```
         - Thực thi toàn bộ statements trong một lần `await env.DB.batch(statements)`.
         - Trả về `{ updatedIds: ids, shelf }`.
       - `upsertReadingProgress(env, bookId, body)` & `deleteReadingProgress(env, bookId)`.
- **File sửa:**
  2. **`workers/r2-storage/src/index.ts`** (giảm còn ~320 dòng):
     - Import các helper từ `./booksDb`.
     - Thêm route handler sau `POST /api/books/bulk-delete`:
       ```ts
       if (pathname === '/api/books/bulk-shelf' && request.method === 'POST') {
         const body = (await request.json().catch(() => null)) as { ids?: unknown; shelf?: unknown } | null;
         const result = await bulkUpdateShelfInDb(env, body?.ids, body?.shelf);
         return jsonResponse(result, 200, origin);
       }
       ```
  3. **`docs/ARCHITECTURE.md`** & **`HANDOFF.md`**:
     - Cập nhật bảng module (thêm `workers/r2-storage/src/booksDb.ts`) và bảng API Worker (thêm `POST /api/books/bulk-shelf`).
- **Kiểm thử & Deploy Worker (Bắt buộc theo thứ tự):**
  1. Chạy `cd workers/r2-storage && npx tsc --noEmit` → 0 lỗi.
  2. Chạy `npm run lint` ở thư mục gốc → 0 lỗi (xác nhận cả `index.ts` và `booksDb.ts` đều dưới trần 500 dòng của ESLint).
  3. **Deploy Worker live:**
     ```powershell
     cd workers/r2-storage
     npm run deploy
     ```
     *(Lưu ý: Endpoint `POST /api/books/bulk-shelf` là route mới hoàn toàn, tương thích ngược 100% với bản frontend đang chạy trên `https://ofu.lol`, nên deploy Worker trước sẽ không gây gián đoạn).*
- **Rủi ro & giảm thiểu:**
  - *Giới hạn biến bind của Cloudflare D1 (~100 biến/câu SQL):* Đã chia lô cứng `<= 50` ID mỗi câu `UPDATE` (tổng 51 bind params tính cả `shelf`) và gom trong `env.DB.batch()`, đảm bảo chuyển kệ cho hàng trăm cuốn cùng lúc vẫn an toàn tuyệt đối.
- **Cách hoàn tác:** `git revert <commit-phase-1>` và chạy lại `cd workers/r2-storage && npm run deploy`.

---

### Phase 2 — Mở rộng nhận diện bộ truyện & điểm chung hàng đợi (`src/lib/shelfPlacement.ts`)

- **Mục tiêu:** Nhận diện chính xác các mẫu tên tập phổ biến (`SAO1`, `SAOP1`, `SAO (01)`, `SAO v01`, `Tên truyện - 01`...) và tự động suy luận kệ chung cho một lô sách cùng bộ (`SAO1`, `SAO2`, `SAOP1`, `SAO_IF`, `SAO_ALT` → `SAO`) mà không gom nhầm các sách lẻ ngẫu nhiên.
- **File sửa:**
  1. **`src/lib/shelfPlacement.ts`** (~260 dòng, thoải mái dưới trần 500 dòng):
     - **Mở rộng `extractSeriesName(title: string): string | null`**:
       - Giữ nguyên khả năng tách các hậu tố có từ khoá (`Vol`, `Volume`, `Tập`, `Quyển`, `Chương`, `Phần`, `Book`, `Part`, `#`).
       - Bổ sung nhận diện:
         1. **Số tập viết tắt / trong ngoặc / sau dấu gạch hoặc khoảng trắng ở cuối tiêu đề**:
            - Ví dụ: `SAO (01)`, `SAO [01]`, `SAO (1)`, `SAO v01`, `SAO v1`, `SAO vol.1`, `SAO Ep 01`, `Tên truyện - 01`, `Tên truyện _ 01`, `SAO 01` → tách về gốc trước phần số tập (`SAO`, `Tên truyện`).
            - Quy tắc an toàn: phần gốc còn lại phải có ít nhất 2 ký tự chữ/số có nghĩa và không biến số năm/tiêu đề thuần số (như `1984`, `86`) thành chuỗi rỗng.
         2. **Số tập dính liền ngay sau gốc chữ cái (`Compact Alphanumeric Volume`)**:
            - Ví dụ: `SAO1`, `SAO2`, `SAO10`, `SAOP1` → khớp mẫu `^([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9\s]{1,}?)0*\d{1,3}$` khi phần chữ cái liền trước chữ số dài `>= 2` ký tự và không phải ký hiệu kỹ thuật ngắn (`2D`, `3D`, `4K`, `A4`, `MP3`, `F1`...).
            - Với `SAO1`, `SAO2` → trả về `SAO`.
     - **Thêm hàm `inferBatchCommonShelf(items: Array<{ title: string; author: string }>, existingBooks: Book[]): string | null`**:
       - Nếu `items.length < 2` → trả về `null`.
       - **Bước 1 — Trích xuất các ứng viên gốc (Candidate Stems) cho mỗi tệp**:
         - Với mỗi `item.title`:
           - Lấy `series = extractSeriesName(item.title)` (nếu có).
           - Tách tiền tố theo dấu phân cách bộ/nhánh (`_`, `-`, `:`, `/`, `(`, `[`) hoặc khoảng trắng: ví dụ `SAO_IF` → tiền tố `SAO`; `SAO_ALT` → tiền tố `SAO`; `Black Bullet: New World Order 01` → `Black Bullet: New World Order` và `Black Bullet`.
           - Nếu token đầu là mã viết tắt in hoa mở rộng (ví dụ `SAOP1` → sau khi bỏ số còn `SAOP` dài 4 ký tự), sinh thêm tiền tố gốc 3 ký tự đầu (`SAO`) để so khớp chéo với các tệp khác trong cùng lô (`SAO1`, `SAO_IF`).
       - **Bước 2 — Tìm gốc chung tốt nhất giữa các tệp trong lô**:
         - Lọc bỏ các ứng viên vi phạm điều kiện **Chống gom nhầm**:
           - Độ dài sau khi `trim` phải `>= 2` ký tự có nghĩa (nếu là từ thường có khoảng trắng hoặc chữ thường thì yêu cầu `>= 3` ký tự; cho phép 2–3 ký tự nếu là từ viết tắt như `SAO`, `RE` hoặc tên riêng hợp lệ).
           - Không nằm trong tập **từ mở đầu vô nghĩa (`STOPWORD_PREFIXES`)**: `the`, `a`, `an`, `tập`, `tap`, `quyển`, `quyen`, `vol`, `volume`, `chương`, `chuong`, `phần`, `phan`, `book`, `part`, `sách`, `sach`, `truyện`, `truyen`, `light novel`, `novel`, `chronicle`, `anthology`.
         - Điều kiện đa số: ứng viên phải khớp với **`>= Math.max(2, Math.ceil(items.length * 0.5))`** tệp trong hàng đợi (tức `>= 50%` số tệp và tối thiểu `2` tệp cùng gốc).
         - Chấm điểm lựa chọn ứng viên thắng cuộc:
           - Ưu tiên ứng viên bao phủ được nhiều tệp nhất trong lô (ví dụ `SAO` khớp cả 5/5 tệp `SAO1, SAO2, SAOP1, SAO_IF, SAO_ALT`).
           - Nếu hai ứng viên có cùng số tệp khớp (ví dụ cả `Black Bullet` và `Black Bullet: New World Order` cùng khớp 4/4 tệp), ưu tiên tiền tố dài & cụ thể hơn (`Black Bullet: New World Order`).
       - **Bước 3 — Đồng bộ với kệ đã có trong thư viện (`existingBooks`)**:
         - Nếu ứng viên thắng cuộc trùng tên (không phân biệt hoa thường tiếng Việt qua `normalizeKey`) với một kệ đã tồn tại trong `existingBooks`, trả về chính xác tên kệ đang có trong `existingBooks`. Ngược lại trả về tên ứng viên đã chuẩn hoá khoảng trắng.
  2. **`docs/ARCHITECTURE.md`** & **`HANDOFF.md`**:
     - Cập nhật export `inferBatchCommonShelf` của `src/lib/shelfPlacement.ts` trong Mục 2 và Mục 6 ("Công cụ đã có — cấm viết lại").
- **Kiểm thử độc lập:**
  - `npm run typecheck`, `npm run lint`, `npm run build` đều xanh.
  - Kiểm tra bảng test cases:
    - `['SAO1', 'SAO2', 'SAO3', 'SAOP1', 'SAO_IF', 'SAO_ALT']` → `inferBatchCommonShelf` trả về `'SAO'`.
    - `['SAO (01)', 'SAO [02]', 'SAO v03', 'SAO vol.4']` → cả `extractSeriesName` và `inferBatchCommonShelf` đều trả về `'SAO'`.
    - `['Black Bullet: New World Order 01', 'Black Bullet: New World Order 02']` → trả về `'Black Bullet: New World Order'`.
    - `['The Hobbit', 'The Martian', 'The Alchemist']` → `inferBatchCommonShelf` trả về `null` (chặn gom nhầm theo từ mở đầu `'The'`).
    - `['Tập 1 - Mở đầu', 'Tập 2 - Kết thúc']` → `inferBatchCommonShelf` trả về `null` (chặn từ vô nghĩa `'Tập'`).
- **Rủi ro & giảm thiểu:**
  - *Rủi ro cắt nhầm số trong tên sách lẻ (ví dụ `1984`, `Fahrenheit 451`, `2001: A Space Odyssey`):*
    - Với `1984` hoặc `2001`: phần trước số là rỗng nên `extractSeriesName` giữ nguyên không cắt.
    - Với `Fahrenheit 451`: khi chỉ tải 1 cuốn lẻ hoặc tải chung với các sách khác không cùng tiền tố `Fahrenheit`, nếu người dùng muốn giữ nguyên tên hoặc đổi kệ thì ở Phase 3 đã có pill checkbox ngay ở footer `UploadDropzone` để sửa tên kệ hoặc bỏ tick 1 chạm. Tuy nhiên để chính xác hơn nữa, mẫu số dính liền chữ (`SAO1`) chỉ tách khi phần số là số tập nhỏ (`01..99` hoặc `1..199`) và với số cách khoảng trắng (`SAO 01`) chỉ tách khi số có `0` đứng đầu (`01`, `02`) hoặc ≤ 2 chữ số (`1..99`), tránh cắt `Fahrenheit 451` hay `2049`!
- **Cách hoàn tác:** `git revert <commit-phase-2>`.

---

### Phase 3 — Nút tick gom kệ ở footer `UploadDropzone.tsx` (`UploadBatchShelfBar.tsx`)

- **Mục tiêu:** Cho phép người dùng nhìn thấy, bật/tắt và sửa nhanh kệ chung `<Tên>` ngay ở góc trái thanh footer `UploadDropzone`, đồng bộ tức thì với preview từng tệp trong `UploadQueueList` và ép toàn bộ lô vào đúng kệ `<Tên>` khi bấm `Tải lên (N)`.
- **Kiểm soát trần 500 dòng:**
  - `src/components/UploadDropzone.tsx` đang 454 dòng. Ta tách phần UI pill gom kệ ở footer thành component riêng `src/components/UploadBatchShelfBar.tsx` (~115 dòng) để `UploadDropzone.tsx` giữ ở mức ~465 dòng tổng (~425 dòng hiệu dụng).
- **File tạo mới:**
  1. **`src/components/UploadBatchShelfBar.tsx`** (~115 dòng):
     - Props:
       - `visible: boolean` (hiển thị khi số tệp active trong hàng đợi `>= 2` hoặc khi `suggestedShelf !== null`)
       - `enabled: boolean` (trạng thái tick chọn)
       - `shelfName: string` (tên kệ sẽ áp dụng cho cả lô)
       - `existingShelves: string[]` (danh sách kệ hiện có cho `<datalist>`)
       - `disabled: boolean` (khoá khi `uploading === true`)
       - `onToggle: (nextEnabled: boolean) => void`
       - `onChangeShelfName: (nextName: string) => void`
     - Thiết kế UI:
       - Dạng pill nằm bên trái footer:
         - Checkbox + nhãn `Thêm vào kệ` + tên kệ `<Tên>` in đậm màu `accent` (`max-w-[9rem] sm:max-w-[13rem] truncate` kèm `title={shelfName}` để hover xem đầy đủ khi tên dài).
         - Nút bấm sửa nhanh (icon cây bút `Pencil` hoặc bấm trực tiếp vào tên kệ) mở ngay ô input nhỏ gọn tại chỗ trên pill (`list="upload-batch-shelves-datalist"`, nhấn `Enter` hoặc `blur` để chốt tên mới, nhấn `Escape` để huỷ sửa).
- **File sửa:**
  2. **`src/components/UploadQueueList.tsx`** (~165 dòng):
     - Thêm prop tuỳ chọn `batchShelfOverride?: string | null`.
     - Khi tính `displayShelf` cho mỗi item chưa hoàn tất (`item.status !== 'done'`): nếu có `batchShelfOverride?.trim()` thì hiển thị ngay `batchShelfOverride.trim()`, ngược lại gọi `resolvePreviewShelfName(item, activePreviewItems, books)`.
  3. **`src/components/UploadDropzone.tsx`** (~465 dòng):
     - Tính `activeQueueItems = useMemo(() => queue.filter((i) => i.status === 'queued' || i.status === 'uploading'), [queue])`.
     - Tính `inferredCommonShelf = useMemo(() => inferBatchCommonShelf(activeQueueItems, books), [activeQueueItems, books])`.
     - Tính `existingShelves = useMemo(() => groupBooksIntoShelves(books).map((s) => s.name), [books])`.
     - Quản lý state gom kệ theo lô:
       - `batchShelfEnabled: boolean`
       - `batchShelfCustomName: string | null` (khi người dùng tự gõ tên kệ khác với `inferredCommonShelf`)
       - `userToggledBatchRef`: mỗi khi `inferredCommonShelf` chuyển từ `null` sang có giá trị mới (và người dùng chưa chủ động bỏ tick trong phiên hàng đợi hiện tại), tự động bật `batchShelfEnabled = true`. Khi xoá sạch hàng đợi (`queue.length === 0`), reset về mặc định.
       - Tên kệ hiệu lực của pill: `resolvedBatchShelf = (batchShelfCustomName ?? inferredCommonShelf ?? activeQueueItems[0]?.shelf ?? '').trim()`.
       - `effectiveBatchShelf = batchShelfEnabled && resolvedBatchShelf ? resolvedBatchShelf : null`.
     - Trong `handleStartUpload()`:
       - Nếu `effectiveBatchShelf` khác `null`: truyền thẳng `shelf: effectiveBatchShelf` vào `uploadBook(current.file, { title: current.title, author: current.author, shelf: effectiveBatchShelf })` cho toàn bộ tệp trong lô (không tách lẻ và không chạy `booksToRegroup` theo tác giả lẻ).
       - Nếu `effectiveBatchShelf === null` (người dùng đã bỏ tick): giữ nguyên logic `resolveUploadShelfPlan()` theo từng cuốn như cũ.
     - Trong thanh footer: đặt `<UploadBatchShelfBar ... />` ở khối bên trái (cùng nhóm với nút `Thử lại N tệp lỗi` nếu có), ngang hàng với nút `Đóng` và `Tải lên (N)` ở bên phải.
  4. **`docs/ARCHITECTURE.md`** & **`HANDOFF.md`**:
     - Thêm `src/components/UploadBatchShelfBar.tsx` vào bảng module Mục 2 và cập nhật mô tả `UploadDropzone.tsx`, `UploadQueueList.tsx`.
- **Kiểm thử độc lập:**
  - `npm run typecheck`, `npm run lint`, `npm run build` đều xanh.
  - Kéo-thả 3 tệp `SAO1.epub`, `SAO2.epub`, `SAOP1.epub`: pill `Thêm vào kệ SAO` tự động hiện và được tick sẵn; cả 3 dòng trong hàng đợi đều hiện `Kệ: SAO`; thử sửa tên trên pill thành `Sword Art Online` → cả 3 dòng đổi sang `Kệ: Sword Art Online`; thử bỏ tick → từng dòng quay về kệ riêng.
- **Rủi ro & giảm thiểu:**
  - *Người dùng tự sửa tên kệ trên pill rồi thêm tiếp 1 tệp nữa vào hàng đợi:* Nhờ tách riêng `batchShelfCustomName` với `inferredCommonShelf`, tên kệ do người dùng tự nhập luôn được giữ ưu tiên cho đến khi hàng đợi được tải xong hoặc xoá trắng.
- **Cách hoàn tác:** `git revert <commit-phase-3>`.

---

### Phase 4 — Chuyển kệ hàng loạt cho sách đã tải lên (`BulkShelfModal.tsx` + `Library2DView.tsx` + `App.tsx` + `src/lib/api.ts`)

- **Mục tiêu:** Cho phép chọn nhiều sách trong thư viện (hoặc lọc `SAO` → `Chọn tất cả` 41 cuốn) rồi bấm `Chuyển kệ (41)` để gom toàn bộ về chung 1 kệ chỉ bằng 1 request.
- **Kiểm soát trần 500 dòng cho `src/lib/api.ts`:**
  - `src/lib/api.ts` đang 487 dòng tổng (~438 dòng hiệu dụng). Khi thêm `bulkUpdateBooksShelf` (~26 dòng), ta đồng thời rút gọn vài khai báo kiểu inline dài dòng trong `src/lib/api.ts` để tổng số dòng của `src/lib/api.ts` giữ ở mức ~485 dòng tổng (~435 dòng hiệu dụng), an toàn dưới trần 500 dòng.
- **File tạo mới:**
  1. **`src/components/BulkShelfModal.tsx`** (~190 dòng):
     - Props:
       - `books: Book[]` (danh sách sách đang chọn để chuyển kệ; rỗng thì return `null`)
       - `existingShelves: string[]`
       - `onClose: () => void`
       - `onMoved: (bookIds: string[], targetShelf: string) => void`
       - `onApiError: (err: unknown, fallbackMessage: string) => void`
       - `onNotify: (message: string, type?: ToastType) => void`
     - Hành vi & UI:
       - Khi mở modal với `books.length > 0`: tự động gợi ý tên kệ ban đầu bằng `inferBatchCommonShelf(books, books) || books[0].shelf || ''`, đồng thời focus & bôi đen ô input để người dùng có thể bấm `Enter` xác nhận ngay hoặc gõ tên mới.
       - Ô nhập `Tên kệ đích` (`maxLength={120}`, `required`) kèm `<datalist>` gợi ý kệ.
       - Danh sách **chips tất cả các kệ hiện có** (`existingShelves`) để người dùng bấm chọn nhanh 1 chạm (chip khớp với giá trị đang nhập sẽ được tô nổi bằng viền và nền `accent`).
       - Khối tóm tắt hiển thị số lượng sách sẽ chuyển (`${books.length} cuốn`) kèm danh sách rút gọn tên sách (hiển thị tối đa 5 cuốn đầu + `...và N cuốn khác`).
       - Khi submit:
         - Gọi `await bulkUpdateBooksShelf(books.map((b) => b.id), trimmedShelf)`.
         - Gọi `onMoved(books.map((b) => b.id), trimmedShelf)`.
         - Hiện toast thành công: `Đã chuyển ${books.length} cuốn vào kệ "${trimmedShelf}".`.
         - Gọi `onClose()`.
- **File sửa:**
  2. **`src/lib/api.ts`** (~485 dòng):
     - Thêm hàm export `bulkUpdateBooksShelf(bookIds: string[], targetShelf: string): Promise<void>`:
       - `assertApiConfigured();`
       - Chuẩn hoá `const shelf = targetShelf.trim();`, nếu `bookIds.length === 0 || !shelf` thì return.
       - **Chế độ Local-First (`!isCloudMode`)**:
         - Đọc `const books = await getLocalBooks();`, lập `const idSet = new Set(bookIds);`.
         - Với mỗi cuốn `b` có `idSet.has(b.id)`: gọi `await putLocalBook({ ...b, shelf });`.
       - **Chế độ Cloud (`isCloudMode`)**:
         - Gọi `POST /api/books/bulk-shelf` với body `{ ids: bookIds, shelf }`.
         - Nếu `!res.ok`, đọc thông báo lỗi từ JSON và `throw new Error(data.error || 'Không thể chuyển kệ cho các sách đã chọn.')`.
  3. **`src/components/Library2DView.tsx`** (~455 dòng):
     - Thêm prop `onMoveSelectedToShelf?: (selectedBooks: Book[]) => void` và `selectionResetKey?: number`.
     - Thêm `useEffect` lắng nghe `selectionResetKey`: mỗi khi `selectionResetKey` tăng (sau khi hoàn tất chuyển kệ hàng loạt), tự động đặt `setSelectionMode(false)` và `setSelectedIds(new Set())` để thoát chế độ chọn nhiều đúng yêu cầu.
     - Trong thanh công cụ `selectionMode`, đặt nút `Chuyển kệ (${selectedBooks.length})` (icon `FolderInput` hoặc `FolderEdit`) ngay bên trái nút `Xoá đã chọn (${selectedBooks.length})`:
       - Nút `Chọn tất cả` hiện tại đã chọn toàn bộ `filteredBooks` (`new Set(filteredBooks.map((book) => book.id))`), nên khi người dùng gõ `SAO` vào ô tìm kiếm rồi bấm `Chọn tất cả` → chọn đúng 41 cuốn SAO → bấm `Chuyển kệ (41)` là gom xong trong 1 bước.
  4. **`src/App.tsx`** (~225 dòng):
     - Mở rộng `LibraryModalState` thêm nhánh `| { kind: 'bulk-shelf'; books: Book[] }`.
     - Thêm state `const [selectionResetKey, setSelectionResetKey] = useState(0);`.
     - Thêm callback `handleBooksShelfMoved(bookIds: string[], targetShelf: string)`:
       - Cập nhật `setBooks((prev) => prev.map((item) => (idSet.has(item.id) ? { ...item, shelf: targetShelf } : item)))`.
       - Tăng `setSelectionResetKey((prev) => prev + 1)` để `Library2DView` tự động thoát chế độ chọn nhiều.
     - Truyền `onMoveSelectedToShelf={(selectedBooks) => setModal({ kind: 'bulk-shelf', books: selectedBooks })}` và `selectionResetKey={selectionResetKey}` xuống `Library2DView`.
     - Render `<BulkShelfModal books={modal.kind === 'bulk-shelf' ? modal.books : []} existingShelves={existingShelves} onClose={closeModal} onMoved={handleBooksShelfMoved} onApiError={handleApiError} onNotify={addToast} />`.
  5. **`docs/ARCHITECTURE.md`** & **`HANDOFF.md`**:
     - Cập nhật `BulkShelfModal.tsx`, `bulkUpdateBooksShelf` trong Mục 2 và Mục 6 của `docs/ARCHITECTURE.md`.
     - Cập nhật tiến độ hoàn tất 4 phase trong `HANDOFF.md`.
- **Kiểm thử độc lập:**
  - `npm run typecheck`, `npm run lint`, `npm run build` và `cd workers/r2-storage && npx tsc --noEmit` đều xanh 100%.
- **Rủi ro & giảm thiểu:**
  - *Đang lọc theo 1 kệ cụ thể (`activeShelfKey`) rồi chuyển toàn bộ sách trong kệ đó sang kệ khác:* `Library2DView` đã có sẵn `useEffect` (dòng 86–90) tự động reset `activeShelfKey` về `null` khi kệ đang lọc không còn cuốn nào, nên giao diện sẽ tự chuyển mượt về chế độ xem tất cả kệ mà không bị màn hình trống.
- **Cách hoàn tác:** `git revert <commit-phase-4>`.

---

## 3. Thứ tự Deploy & Hướng dẫn gom nhanh 41 cuốn SAO trên `https://ofu.lol`

1. **Bước 1 — Deploy Cloudflare Worker trước (ngay trong/sau Phase 1):**
   ```powershell
   cd workers/r2-storage
   npx tsc --noEmit
   npm run deploy
   ```
   Xác nhận Worker live tại `https://arcane-library-api.novel-check-d467614e.workers.dev` đã có endpoint `POST /api/books/bulk-shelf`.
2. **Bước 2 — Kiểm thử local & Push nhánh `feat/bulk-shelf-grouping` mở PR vào `main`:**
   - Sau khi cả 4 phase hoàn tất và vượt qua checklist kiểm thử bên dưới, push nhánh `feat/bulk-shelf-grouping`, mở PR vào `main`, chờ 2 job CI (`Frontend` và `Worker`) xanh rồi Merge.
   - GitHub Actions `.github/workflows/deploy.yml` sẽ tự động build và cập nhật `https://ofu.lol`.
3. **Bước 3 — Gom 41 cuốn SAO trên `https://ofu.lol` chỉ trong 10 giây:**
   - Mở `https://ofu.lol`.
   - Tại ô tìm kiếm, gõ `SAO` (giao diện sẽ lọc ra 41 cuốn SAO đang nằm rải rác ở các kệ `SAO1`, `SAO2`, `SAOP1`, `SAO_IF`, `SAO_ALT`...).
   - Bấm nút **Chọn nhiều** trên thanh Header → bấm **Chọn tất cả** (đã chọn 41/41 cuốn đang lọc).
   - Bấm nút **Chuyển kệ (41)** → trong cửa sổ `Chuyển kệ hàng loạt`, tên kệ `SAO` đã được gợi ý sẵn (hoặc gõ `Sword Art Online`) → bấm **Chuyển vào kệ**.
   - Toàn bộ 41 cuốn sẽ được gom về duy nhất 1 kệ `SAO` ngay lập tức.

---

## 4. Checklist Kiểm thử (Definition of Done)

### 4A. Kiểm định tĩnh & Build
- [x] `npm run typecheck` — 0 lỗi.
- [x] `npm run lint` — 0 lỗi, 0 cảnh báo (mọi file trong `src/` và `workers/r2-storage/src/` đều dưới trần 500 dòng hiệu dụng).
- [x] `cd workers/r2-storage && npx tsc --noEmit` — 0 lỗi.
- [x] `npm run build` — 0 lỗi, 0 cảnh báo chunk > 500 kB.

### 4B. Kiểm thử đơn vị / logic phân kệ (`shelfPlacement.ts`)
- [x] `extractSeriesName`:
  - `SAO1`, `SAO2`, `SAO 01`, `SAO (01)`, `SAO [01]`, `SAO v01`, `SAO vol.1`, `SAO - 01` → `'SAO'`.
  - `Mushoku Tensei - Tập 12` → `'Mushoku Tensei'`.
  - Tác phẩm lẻ có số năm hoặc số trong tên (`1984`, `Fahrenheit 451`) → không bị cắt cụt sai.
- [x] `inferBatchCommonShelf`:
  - Lô `['SAO1', 'SAO2', 'SAO3', 'SAOP1', 'SAO_IF', 'SAO_ALT']` → `'SAO'`.
  - Lô `['Black Bullet: New World Order 01', 'Black Bullet: New World Order 02']` → `'Black Bullet: New World Order'`.
  - Lô `['REMAKE1', 'REMAIN1']` → `null` (không tự sinh tiền tố 3 ký tự `'REM'` khi không có tệp hay kệ nào mang gốc đó).
  - Lô sách lẻ trùng từ mở đầu vô nghĩa `['The Hobbit', 'The Martian', 'The Alchemist']` hoặc `['Tập 1', 'Tập 2']` → `null` (không gom nhầm).
  - Khi trong kho đã có kệ `'sao'` hoặc `'SAO'`, hoặc khi các tập cũ cùng bộ (`Mushoku Vol 1`) đã được đổi tên kệ sang `'Mushoku Tensei'`, các tập mới tải lên (`Mushoku Vol 2..5`) tự động nhận đúng kệ `'Mushoku Tensei'` và tự gom luôn các tập còn sót ở kệ `'Mushoku'` cũ.

### 4C. Kiểm thử giao diện & Luồng thực tế
- [ ] **Footer `UploadDropzone` (`UploadBatchShelfBar`):**
  - Thêm `>= 2` tệp cùng bộ vào hàng đợi: pill `Thêm vào kệ <Tên>` tự hiện bên trái footer và mặc định được tick.
  - Khi đang tick: toàn bộ tệp trong hàng đợi hiển thị preview `Kệ: <Tên>`; sửa `<Tên>` ngay trên pill thì preview của toàn bộ tệp cập nhật theo; bấm `Tải lên (N)` thì tất cả sách được lưu vào đúng kệ `<Tên>`.
  - Khi bỏ tick: preview và kết quả tải lên quay về phân kệ tự động theo từng cuốn.
- [ ] **Chuyển kệ hàng loạt (`BulkShelfModal`):**
  - Bật `Chọn nhiều` → lọc từ khoá → bấm `Chọn tất cả` → bấm `Chuyển kệ (N)`.
  - Chọn nhanh 1 chip kệ có sẵn hoặc nhập tên kệ mới → bấm xác nhận → sách chuyển về kệ đích trên cả D1 và UI, hiện toast thành công và tự thoát chế độ `Chọn nhiều`.
- [ ] **Live trên `https://ofu.lol`:**
  - Worker đã deploy bản mới, gom thành công 41 cuốn SAO về 1 kệ duy nhất, tải lại trang (`F5`) kệ vẫn giữ nguyên trên D1.
