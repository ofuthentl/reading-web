# Kế hoạch Nâng cấp Tách/Lọc Tên Tác Giả & Tự Động Chọn Kệ (`docs/plans/upgrade-author-and-shelf-matching.md`)

> **Nhánh triển khai dự kiến:** `feat/upgrade-author-and-shelf-matching`
> **Vấn đề thực tế từ người dùng:**
> 1. Nhiều tập sách tải lên vẫn bị tách sai tên tác giả (tiêu đề phụ / tên nhóm dịch / nhãn tập bị đẩy vào cột `author`), kéo theo bộ lọc tên tác giả bị nhiễu rác.
> 2. Tự động chọn kệ khi tải lên gộp nhầm sang kệ phụ/hậu truyện (VD: tải 4 tập `Unnamed Memory` bị trỏ vào kệ `Unnamed Memory -after the end-`; tương tự với `Mushoku Tensei` bị trỏ sang kệ ngoại truyện/hậu truyện).

---

## 1. Nguyên nhân gốc

### A. Tách sai tên tác giả & lọc tác giả còn nhiễu
1. **`parseFileMetadata` & `splitMisplacedTitleAndAuthor` ([bookMetadata.ts](file:///d:/Code/project/src/lib/bookMetadata.ts), [shelfPlacement.ts](file:///d:/Code/project/src/lib/shelfPlacement.ts)):**
   - **Nhãn tập nằm sau tiêu đề phụ:** Với tệp dạng `Mushoku Tensei - Thất Nghiệp Chuyển Sinh - Tập 1.epub` hay `Sword Art Online - Progressive - Tập 1.epub`, vòng `while` dừng ngay tại vế thứ 2 (`Thất Nghiệp Chuyển Sinh` / `Progressive`) và đẩy toàn bộ phần còn lại (`Thất Nghiệp Chuyển Sinh - Tập 1`) sang `author`.
   - **Tiêu đề phụ ngắn sau `Tập X` bị tưởng là tác giả:** Với `Unnamed Memory - Tập 1 - Hồi Ức Vô Danh.epub`, `Mushoku Tensei - Tập 4 - Sư Phụ.epub`, `Overlord - Tập 1 - Bất Tử Vương.epub`, vế cuối chỉ có 2–4 từ không trúng `VN_SUBTITLE_GRAMMAR_RE` nên rơi thẳng vào `author`.
   - **Thiếu bộ lọc nhóm dịch / nguồn / định dạng / phiên bản:** `[Hako]`, `Hako`, `Sonako`, `Cổng Light Novel`, `Valvrareteam`, `Full`, `EPUB`, `Raw`, `Edit`, `Fixed`, `Bản Dịch`, `LN`, `WN`, `Light Novel`, chuỗi trong `[...]`/`(...)`/`【...】` hoặc chuỗi chứa số/năm chưa bị loại khỏi ứng viên tác giả.
2. **Chưa tận dụng dữ liệu thật khi Upload ([apiAdminMutations.ts](file:///d:/Code/project/src/lib/apiAdminMutations.ts), [parsers.ts](file:///d:/Code/project/src/lib/parsers.ts), [uploadBatchHelpers.ts](file:///d:/Code/project/src/lib/uploadBatchHelpers.ts)):**
   - Lúc tải lên đã giải nén tệp ZIP để trích ảnh bìa (`extractCoverAtUpload`) nhưng chưa đọc kèm `<dc:creator>` trong `content.opf` (EPUB) / `docProps/core.xml` (DOCX).
   - Khi tải thêm tập mới vào kệ đã có sẵn tác giả thống nhất trong kho (VD kệ `Unnamed Memory` đã chuẩn hoá là `Furumiya Kuji`), tập mới không tự kế thừa tác giả của kệ.
   - Trong cùng 1 lô tải lên nhiều tập cùng bộ, nếu mỗi tập mang 1 chuỗi hậu tố khác nhau hoàn toàn, hệ thống chưa nhận diện đó là tiêu đề phụ từng tập để gộp về `title`.
3. **Bộ lọc Tác giả chưa đồng bộ khử rác theo kệ ([libraryFiltering.ts](file:///d:/Code/project/src/lib/libraryFiltering.ts), [shelfSummary.ts](file:///d:/Code/project/src/lib/shelfSummary.ts)):**
   - `collectAvailableAuthors` & `matchesBookAuthor` không dùng quy tắc loại tiêu đề phụ rời rạc theo kệ (`isUniqueSubtitleInShelf`) như `shelfSummary.ts`, nên toàn bộ phụ đề bị lưu nhầm ở sách cũ vẫn lọt vào danh sách lọc tác giả.
   - Chưa tách đồng tác giả (`A, B`, `A & B`, `A / B`) khi gom danh sách lọc tác giả.

### B. Tự động chọn kệ trỏ nhầm sang kệ phụ/hậu truyện (`Unnamed Memory` → `Unnamed Memory -after the end-`, `Mushoku Tensei` → kệ phụ)
1. **Đảo ngược ưu tiên trong `resolveExistingSeriesShelf` ([shelfUploadPlanner.ts](file:///d:/Code/project/src/lib/shelfUploadPlanner.ts#L115-L128)):**
   - Đoạn `if (group.isRenamed !== chosen.isRenamed) { if (group.isRenamed) chosen = group; }` **ép kệ khác tên (`isRenamed = true`) luôn thắng cả kệ khớp chính xác (`Unnamed Memory`)**, thậm chí còn đưa sách ở `Unnamed Memory` vào `booksToRegroup` sang kệ kia.
2. **Cắt mất tên phụ của phần kế / hậu truyện trong `extractSeriesName` ([shelfPlacement.ts](file:///d:/Code/project/src/lib/shelfPlacement.ts#L20-L39)):**
   - `after the end` (và `hậu truyện`, `tiền truyện`, `ngoại truyện` dạng bộ nhiều tập) đang nằm trong `SPECIAL_VOL_PREFIX`/`EXTRA_LABEL`, làm `extractSeriesName("Unnamed Memory -after the end- Tập 1")` trả về `"Unnamed Memory"`, trộn lẫn 2 bộ khác nhau vào cùng 1 tập `peerSeriesBooks`.
   - Đồng thời `cleanShelfLabel` tước dấu `-` ở cuối tên nên cần so khớp cả dạng đã làm sạch dấu câu 2 đầu (`normalizeShelfMatchKey`) để `Unnamed Memory -after the end- Tập 1..4` trỏ đúng về kệ `"Unnamed Memory -after the end-"`.
3. **Khớp tiền tố mù `prefixShelf` ([shelfUploadPlanner.ts](file:///d:/Code/project/src/lib/shelfUploadPlanner.ts#L139-L147)):**
   - `sKey.startsWith(seriesKey + ' ')` ép `"unnamed memory"` khớp nhầm vào `"unnamed memory -after the end-"` và `"mushoku tensei"` khớp nhầm vào `"mushoku tensei - redundancy"` / `"mushoku tensei - ngoại truyện"` khi kệ chính chưa tồn tại hoặc có nhiều kệ chung tiền tố.

---

## 2. Các quyết định cần chốt trước khi code

### QĐ-1: Chiến lược xác định tác giả khi tải sách mới (Upload)
- **Phương án 1A (Khuyến nghị — Kế thừa tác giả kệ sẵn có → đọc `<dc:creator>` từ EPUB/DOCX → tách tên file chặt chẽ):**
  - Thứ tự ưu tiên: (1) Tác giả thống nhất của kệ đích đang tồn tại trong kho (tránh tập mới ghi đảo tên `Kuji Furumiya` hoặc tiếng Nhật làm lệch bộ cũ); (2) `<dc:creator>` hợp lệ đọc ngay trong lần mở ZIP trích bìa (`0` lần giải nén thêm, đã lọc blacklist `calibre`/`Hako`/`Sonako`/`Admin`/URL); (3) Tác giả tách chặt từ tên file (kèm khử tiêu đề phụ khác nhau giữa các tập trong cùng lô); (4) `Không rõ tác giả`.
  - *Điểm yếu:* Một số file EPUB tự đóng gói có thể ghi nickname dịch giả lạ trong `<dc:creator>` (không trúng blacklist) khi tải bộ hoàn toàn mới; vẫn sửa 1 chạm được qua `Ghi chú & Tác giả` / AniList.
- **Phương án 1B (Chỉ nâng cấp tách tên file + kế thừa tác giả kệ, không đọc `<dc:creator>`):**
  - Tránh 100% rủi ro nickname lạ trong `<dc:creator>`.
  - *Điểm yếu:* Bộ mới tải lên mà tên file không ghi tác giả (`Ten Truyen - Tap 1.epub`) sẽ luôn thành `Không rõ tác giả` cho tới khi chỉnh tay.
- **Phương án 1C (Đọc `<dc:creator>` ngay lúc kéo thả file vào hàng đợi xem trước):**
  - Hiện sẵn tác giả trích từ EPUB trước khi bấm `Tải lên`.
  - *Điểm yếu:* Kéo thả lô lớn 20–30 file (~300 MB) sẽ đọc đồng loạt ZIP ngay trên UI gây khựng/tốn RAM.

### QĐ-2: Quy tắc tự động khớp kệ sẵn có
- **Phương án 2A (Khuyến nghị — Khớp chính xác luôn thắng tuyệt đối + tách riêng hậu truyện/ngoại truyện nhiều tập + chặn khớp tiền tố sang kệ phụ/nhiều kệ trùng gốc):**
  - Khớp chính xác (`exactMatch` theo `normalizeShelfPlacementKey` hoặc `normalizeShelfMatchKey` bỏ dấu câu thừa 2 đầu như `-` cuối) **luôn ưu tiên số 1**, không bao giờ bị kệ `isRenamed` đè lên hay regroup sang kệ khác.
  - Gỡ `after the end` (và chỉ coi `hậu truyện`/`tiền truyện`/`ngoại truyện`/`redundancy`/`progressive` là tên bộ riêng khi mang số tập `Tập/Vol/Quyển/I..XX` hoặc có kệ riêng trong kho) để `Unnamed Memory` và `Unnamed Memory -after the end-`, `Mushoku Tensei` và `Mushoku Tensei - Redundancy / Ngoại Truyện` tách bạch 2 chiều.
  - Chỉ kế thừa kệ đổi tên (`isRenamed` như `Mushoku Tensei - Thất Nghiệp Chuyển Sinh`) khi chưa có kệ khớp chính xác, kệ đó không chứa hậu tố phụ/hậu truyện/ngoại truyện, và không bị mơ hồ giữa `>= 2` kệ cùng tiền tố.
  - *Điểm yếu:* Một tập ngoại truyện lẻ không đánh số (`Ten Bo - Ngoai Truyen.epub`) tải đơn lẻ riêng ngoài lô chính có thể tạo kệ riêng thay vì tự gộp vào kệ chính (tải chung lô `>= 80%` hoặc chỉnh 1 chạm ở pill kệ chung vẫn gom bình thường).
- **Phương án 2B (Chỉ sửa ưu tiên `exactMatch` & bỏ `prefixShelf`, giữ nguyên `after the end` trong `extractSeriesName`):**
  - *Điểm yếu:* Khi tải 4 tập `Unnamed Memory -after the end- Tập 1..4` lúc đã có kệ `Unnamed Memory`, hệ thống vẫn cắt mất `-after the end-` và nhồi ngược vào `Unnamed Memory`.

### QĐ-3: Dọn/khử rác ở Bộ lọc Tác giả đối với sách cũ đã lưu sai trên D1
- **Phương án 3A (Khuyến nghị — Khử rác đồng bộ theo kệ ở tầng lọc + tách đồng tác giả + báo cáo trong Sức khoẻ kho sách, không tự ghi đè D1):**
  - `collectAvailableAuthors`, `matchesBookAuthor` và `auditLibraryHealth` cùng dùng bộ lọc ngữ cảnh kệ + nhận diện rác/phụ đề mới để danh sách gợi ý lọc tác giả sạch ngay tức thì (tách cả đồng tác giả `A, B`), không có rủi ro ghi đè ngoài ý muốn lên D1.
  - *Điểm yếu:* Dữ liệu thô trên D1 của sách cũ vẫn giữ nguyên cho tới khi Admin lưu lại qua `Ghi chú & Tác giả` / AniList.
- **Phương án 3B (Giống 3A + thêm nút sửa hàng loạt D1 trong `AdminLibraryHealthModal`):**
  - Dọn luôn dữ liệu thô trên D1 bằng 1 chạm (khôi phục phụ đề bị cắt sang `author` về lại `title` và đồng bộ `author` theo kệ).
  - *Điểm yếu:* Tăng phạm vi thay đổi (chạm thêm UI `AdminLibraryHealthModal` + batch `PATCH` D1), cần xác nhận kỹ trước khi ghi hàng loạt.

---

## 3. Lộ trình triển khai dự kiến (4 Phase nhỏ)

### Phase 1 — Nâng cấp lõi nhận diện tác giả, tiêu đề phụ & tên bộ (`src/lib/authorHeuristics.ts`, `src/lib/shelfPlacement.ts`, `src/lib/bookMetadata.ts`)
- Tạo `src/lib/authorHeuristics.ts` (giữ mọi file `<= 500` dòng, `0 B` thêm nếu tách gọn hoặc siêu nhẹ cho entry):
  - Bộ nhận diện nhãn nhóm dịch/nguồn/định dạng/ngoặc/số không phải tác giả (`isNonAuthorMetadataNoise`).
  - Bộ nhận diện tiêu đề phụ tiếng Việt/Anh nâng cấp (`isLikelyVolumeSubtitle`) + hàm kiểm định ứng viên tên người (`isPlausibleAuthorCandidate`).
  - Bộ tách & chuẩn hoá chuỗi đồng tác giả (`splitNormalizedAuthors`) và kiểm tra tiêu đề phụ rời rạc theo kệ dùng chung (`buildShelfAuthorContext`) giữa `shelfSummary.ts`, `libraryFiltering.ts`, `libraryHealthAudit.ts`.
- Cập nhật `src/lib/shelfPlacement.ts`:
  - Gỡ `after the end` khỏi `SPECIAL_VOL_PREFIX`/`EXTRA_LABEL`; thêm `hasSubSeriesSuffix()` (nhận diện kệ/tiêu đề hậu truyện/ngoại truyện/spinoff như `after the end`, `redundancy`, `ngoại truyện`, `hậu truyện`, `tiền truyện`, `progressive`, `jobless oblige`, `old dragon's tale`, `recollection`, `side story`, `short story`, `gaiden`, `spinoff`…) và `normalizeShelfMatchKey()` (chuẩn hoá không nhạy dấu gạch/hai chấm thừa ở hai đầu).
- Cập nhật `src/lib/bookMetadata.ts`:
  - Nâng cấp `parseFileMetadata` & `splitMisplacedTitleAndAuthor`: tìm vị trí nhãn tập **cuối cùng** trong `segments` (gộp toàn bộ vế trước và gồm nhãn tập vào `title`), xử lý chặt vế sau nhãn tập trơn (`Tập X - ...`), loại rác nhóm dịch/định dạng/tiêu đề phụ ngắn khỏi `author`.
- **Rủi ro & hoàn tác:** Hàm thuần không side-effect, kiểm thử bằng bộ test case phong phú trước khi tích hợp; hoàn tác bằng `git revert`.

### Phase 2 — Sửa triệt để tự động chọn kệ (`src/lib/shelfUploadPlanner.ts`)
- Sửa `resolveExistingSeriesShelf`:
  - Kiểm tra **khớp chính xác tên kệ** (`exactMatch` theo cả `normalizeShelfPlacementKey` và `normalizeShelfMatchKey`) **TRƯỚC** mọi suy đoán `peerSeriesBooks` / `isRenamed` → `Unnamed Memory` luôn trỏ vào `Unnamed Memory`, `Unnamed Memory -after the end-` luôn trỏ vào `Unnamed Memory -after the end-`.
  - Lọc bỏ các sách thuộc kệ mang hậu tố sub-series (`hasSubSeriesSuffix`) khỏi nhóm `peerSeriesBooks` của bộ chính, và không bao giờ đặt `isRenamed` đè lên `exactMatch` hay tự regroup sách ra khỏi kệ khớp chính xác.
  - Thay `prefixShelf` mù (`sKey.startsWith(seriesKey + ' ')`) bằng khớp an toàn: chỉ chấp nhận kệ mở rộng khi không mang hậu tố sub-series/ngoại truyện/hậu truyện VÀ chỉ có duy nhất 1 kệ ứng viên không mơ hồ.
- Cập nhật `inferBatchCommonShelf`: giữ nguyên tên bộ đầy đủ gồm sub-series (vd lô 4 tập `Unnamed Memory -after the end-` nhận đúng `Unnamed Memory -after the end-` thay vì cắt về `Unnamed Memory`), và không kéo lô `Unnamed Memory` sang kệ `Unnamed Memory -after the end-`.
- **Rủi ro & hoàn tác:** Cô lập hoàn toàn trong chunk nạp lười `shelfUploadPlanner.ts`; hoàn tác bằng `git revert`.

### Phase 3 — Nâng cấp luồng Upload & Đồng bộ Bộ lọc Tác giả (`parsers.ts`, `apiAdminMutations.ts`, `uploadBatchHelpers.ts`, `libraryFiltering.ts`, `shelfSummary.ts`, `libraryHealthAudit.ts`, `useLibraryViewState.ts`)
- (Nếu chốt QĐ-1A) Bổ sung `extractUploadCoverAndAuthor(file, fileType)` trong `src/lib/parsers.ts` (đọc luôn `<dc:creator>` từ `content.opf` EPUB / `docProps/core.xml` DOCX trong cùng 1 lần mở ZIP trích bìa, có lọc rác `isNonAuthorMetadataNoise`), tích hợp vào `uploadBook` & `executeSequentialUploadBatch` theo thứ tự ưu tiên: Tác giả thống nhất của kệ đích → `<dc:creator>` sạch → Tác giả từ tên file → `Không rõ tác giả`.
- Trong `createUploadQueueItems` (`uploadBatchHelpers.ts`): phát hiện tiêu đề phụ theo lô (nhiều tập chung bộ mang hậu tố khác nhau → gộp trả về `title`, làm sạch `author` ngay lúc xem trước hàng đợi).
- Đồng bộ `libraryFiltering.ts` (`collectAvailableAuthors`, `matchesBookAuthor`), `shelfSummary.ts` và `libraryHealthAudit.ts` dùng chung ngữ cảnh kệ (`buildShelfAuthorContext`) + `splitNormalizedAuthors` để bộ lọc tác giả sạch rác ngay với kho hiện có.
- **Rủi ro & hoàn tác:** Bảo toàn ngân sách entry `index-*.js <= 86.04 kB` gzip (`D-013`), không đổi schema D1/Worker; hoàn tác bằng `git revert`.

### Phase 4 — Kiểm thử tự động + trình duyệt thật & Cập nhật tài liệu
- Viết bộ test kiểm chứng đầy đủ các tình huống thực tế (Unnamed Memory vs `-after the end-`, Mushoku Tensei vs Redundancy/Ngoại truyện/Thất Nghiệp Chuyển Sinh, 20+ mẫu tên file LN thực tế, `<dc:creator>` rác vs sạch, bộ lọc tác giả đa tập).
- Chạy `npm run typecheck`, `npm run lint`, `npm run build` (`index-*.js <= 86.04 kB` gzip) và kiểm thử trực quan trên trình duyệt thật (UploadDropzone + AdvancedSearchPanel lọc tác giả).
- Cập nhật `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `HANDOFF.md` trong cùng commit.

---

## 4. Checklist kiểm thử
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi tệp `<= 500` dòng), `npm run build` (`index-*.js = 85.80 kB gzip <= 86.04 kB`).
- [x] Test tự động tự động chọn kệ (35+ ca kiểm chứng):
  - Kho có sẵn `Unnamed Memory` + `Unnamed Memory -after the end-`: tải 4 tập `Unnamed Memory - Tập 1..4` → trỏ đúng `Unnamed Memory`; tải 4 tập `Unnamed Memory -after the end- Tập 1..4` → trỏ đúng `Unnamed Memory -after the end-`.
  - Kho mới chỉ có `Unnamed Memory -after the end-` (chưa có `Unnamed Memory`): tải 4 tập `Unnamed Memory - Tập 1..4` → tạo/trỏ `Unnamed Memory`, **KHÔNG** đẩy sang `Unnamed Memory -after the end-`.
  - Kho có `Mushoku Tensei` + `Mushoku Tensei - Redundancy` / `Mushoku Tensei - Ngoại Truyện`: tải 4 tập `Mushoku Tensei` → trỏ đúng `Mushoku Tensei`; kho có kệ đổi tên `Mushoku Tensei - Thất Nghiệp Chuyển Sinh` (chưa có kệ `Mushoku Tensei`) → tải `Mushoku Tensei - Tập 15` vẫn trỏ đúng `Mushoku Tensei - Thất Nghiệp Chuyển Sinh`.
- [x] Test tự động tách & lọc tác giả:
  - `Mushoku Tensei - Thất Nghiệp Chuyển Sinh - Tập 1.epub` → `title` giữ nguyên đủ cả `Tập 1`, `author = Không rõ tác giả` (không nhét `Thất Nghiệp Chuyển Sinh - Tập 1`).
  - `Unnamed Memory - Tập 1 - Hồi Ức Vô Danh.epub`, `Overlord - Tập 1 - Bất Tử Vương.epub`, `Mushoku Tensei - Tập 4 - Sư Phụ.epub` → không nhét phụ đề ngắn vào `author`.
  - `Ten Bo - Tap 1 - [Hako].epub`, `Ten Bo - Tap 1 - Sonako - Full.epub` → không nhét nhóm dịch/nhãn vào `author`.
  - `Ten Bo - Tap 1 - Furumiya Kuji.epub` → giữ đúng tác giả `Furumiya Kuji`; đồng tác giả `Reki Kawahara và abec` → giữ nguyên hợp lệ; chữa phụ đề riêng từng tập trong cùng lô (`healBatchParsedMetadata`).
  - Bộ lọc `collectAvailableAuthors` & `matchesBookAuthor`: loại sạch phụ đề rời rạc của dữ liệu cũ trong cùng kệ, tách đúng đồng tác giả `A, B`.
- [x] Kiểm thử trực quan trên trình duyệt thật (`UploadDropzone` xem trước kệ/tác giả, đọc `<dc:creator>`, lọc `calibre 7.0` + kế thừa tác giả kệ + `AdvancedSearchPanel` lọc tác giả, `0` lỗi console).
- [x] Cập nhật `HANDOFF.md`, `docs/ARCHITECTURE.md` và `docs/DECISIONS.md` (`D-044`).
