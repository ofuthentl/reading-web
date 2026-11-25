# Kế hoạch Tối ưu Tốc độ Mở Sách & Tải Sách Lên — Mức 2 (Frontend + Cloudflare Worker) (`docs/plans/optimize-book-open-and-upload.md`)

> **Nhánh triển khai:** `feat/optimize-book-open-and-upload` (tách từ `feat/upgrade-author-and-shelf-matching` đã gồm `D-043` và `D-044`)
> **Phạm vi người dùng chọn:** Mức 2 — Tối ưu đồng bộ cả Frontend (`ofu.lol`) lẫn Cloudflare Worker (`workers/r2-storage`).
> **Ràng buộc bất biến:**
> - **0 migration D1** (không thêm/sửa bảng hay cột mới trên Cloudflare D1).
> - **0 byte re-pack R2** (100% tương thích ngược với toàn bộ ~260+ `guest-packs` và sách sẵn có).
> - Bảo toàn tuyệt đối bảo mật chống cào `D-028`, phân quyền 3 tầng `D-030`/`D-042`, hạn mức cứng `9.0 GiB` (`D-002`) và ngân sách entry `index-*.js <= 86.04 kB` gzip (`D-013`, hiện `85.80 kB` nên chỉ còn `0.24 kB` dư ở entry).
> - Mọi tệp `<= 500` dòng (`max-lines`), mọi `URL.createObjectURL` có `URL.revokeObjectURL` tương ứng.

---

## 1. Tóm tắt nguyên nhân gốc cần xử lý

### A. Mở sách chậm (Owner)
1. **Lặp 5–6 vòng parse/serialize DOM cho mỗi file XHTML** (`src/lib/parsers.ts`, `src/lib/sanitizeHtml.ts`, hồi quy từ `aad1675`): `parseEpubXhtmlDocument` chạy `DOMParser(xhtml)` → `XMLSerializer` → `DOMParser(html)` → gán lại `htmlDoc.body.innerHTML` thừa, rồi `sanitizeBookDocument` lại đọc/ghi chuỗi qua `DOMPurify.sanitize(doc.body.innerHTML)` thêm 2 vòng parse/serialize.
2. **Giải nén tuần tự 100% chữ & 100% ảnh minh hoạ của cả cuốn trước khi mở trang 1** (`src/lib/parsers.ts`): kể cả khi `Cache 0ms` hit từ IndexedDB, mỗi lần mở lại vẫn bung tuần tự toàn bộ ảnh nặng của các chương sau.
3. **Waterfall chờ nối tiếp** (`src/lib/api.ts`, `src/hooks/useBookReader.ts`, `src/App.tsx`): chờ ghi xong cả file 10–50 MB xuống IndexedDB (`await setCachedBookBlob`) rồi mới tải chunk `parsers` → parse xong mới bắt đầu tải `ActiveReaderHost` → `ReaderView` + `readerChapterNumbers`.

### B. Mở sách & xem ảnh chậm (Guest Discord)
1. **2 HTTP round-trip nối tiếp + 6–7 vòng D1 tuần tự** (`src/hooks/useBookReader.ts`, `workers/r2-storage/src/guestPack.ts`, `workers/r2-storage/src/bookChapterAccessDb.ts`, hồi quy từ `09b5739`): gọi `/toc` → chờ tải `GuestCanvasReader` → mới gọi `/chapters/:idx`; mỗi request lại chạy 5–6 câu D1 kiểm tra 3 tầng quyền + đọc manifest + rate-limit nối tiếp nhau.
2. **Ảnh minh hoạ của sách có khoá chương bị đọc lại nguyên file `.pack` mỗi tấm ảnh** (`bookChapterAccessDb.ts#L384-L421`), cộng thêm client tải ảnh tuần tự từng tấm một (`useGuestChapterStream.ts`) và tính lại Canvas layout sau mỗi tấm ảnh.

### C. Tải sách lên (Upload) rất lâu
1. **Mỗi cuốn bị mở ZIP 2 lần và parse DOM 7–8 lần** (`apiAdminMutations.ts`, `guestPackBuilder.ts`, `guestPackHtml.ts`, `epubFootnotes.ts`): mở ZIP #1 chỉ để lấy bìa & tác giả rồi bỏ; mở ZIP #2 để tạo `guest-pack` → dính lại 5–6 vòng parse DOM của `parsers.ts`, cộng thêm `convertChapterToGuestBlocks` + `extractChapterFootnotesForGuestPack` parse thêm 2 lần trên đúng cùng HTML, rồi nén `gzip` tuần tự từng đoạn.
2. **6 bước nặng chạy nối tiếp 100%, nhiều cuốn xếp hàng 1-1** (`apiAdminMutations.ts`, `uploadBatchHelpers.ts`) + `UploadQueueList.tsx` tính lại kệ/tác giả toàn hàng đợi không memoize mỗi lần tiến độ nhảy.
3. **Worker chạy ~27 query D1 (18 lần `SUM` toàn bảng) cho mỗi cuốn upload** (`bookUploadRoutes.ts`, `guestPack.ts`): `getStorageStats` bị gọi 3 lần trong mỗi request `file`, `cover`, `guest-pack`.

---

## 2. Các quyết định cần chốt trước khi code

### QĐ-1: Chiến lược giải nén ảnh minh hoạ khi Owner mở sách
- **Phương án 1A (Khuyến nghị — Chỉ giải nén ảnh chương đang mở, các chương sau giải nén lười khi lật tới + tải lười từng ảnh ở Tab Minh hoạ):**
  - Mở sách chỉ giải nén song song nội dung chữ các chương + bung **song song** ảnh của đúng **chương đang mở** (thường 0–5 ảnh), rồi tự prefetch ngầm ảnh của chương kế tiếp khi rảnh.
  - Khi mở Tab **Minh hoạ** (`ReaderIllustrationGallery`), ảnh các chương chưa đọc sẽ được bung lười khi cuộn tới (bỏ qua ảnh đang che spoiler).
  - Bảo toàn 100% Highlight, Footnotes, Pagination 2 cột (`D-011`) và thu hồi sạch `URL.revokeObjectURL` + giải phóng đối tượng `JSZip` khi đóng sách.
  - *Điểm yếu:* Giữ đối tượng `JSZip` (dữ liệu nén nhỏ gọn) trong RAM suốt lúc đang mở cuốn đó cho tới khi đóng sách; mở Tab Minh hoạ lần đầu có thể hiện xoay nhẹ vài chục mili-giây cho ảnh ở các chương xa.
- **Phương án 1B (Giải nén song song toàn bộ ảnh cả cuốn ngay khi mở sách):**
  - Đơn giản hơn, mở Tab Minh hoạ không cần giải nén thêm.
  - *Điểm yếu:* Sách nhiều tranh màu nặng (30–60 MB ảnh) vẫn phải bung hết ảnh các chương cuối ngay lúc bấm mở, chậm hơn rõ rệt trên điện thoại và tốn RAM hơn nhiều.

### QĐ-2: Mức độ chạy song song khi Upload nhiều sách
- **Phương án 2A (Khuyến nghị — Chạy song song bên trong từng cuốn + tối đa 2 cuốn song song cho file `<= 40 MB`):**
  - *Trong 1 cuốn:* Đọc & mở ZIP đúng 1 lần; vừa đẩy file gốc lên R2 (`PUT /file`) vừa chạy song song ghi cache IndexedDB + tạo gói khách (`buildGuestPackEnvelope`); xong `PUT /file` thì đẩy song song `PUT /cover` và `PUT /guest-pack`.
  - *Giữa nhiều cuốn:* Tính sẵn kế hoạch chia kệ/tác giả cho cả lô trước (bảo toàn 100% logic gom sách lẻ `D-044`), sau đó chạy song song **tối đa 2 cuốn** nếu file `<= 40 MB` (file `> 40 MB` tự về chạy đơn `1` cuốn để không ngốn RAM).
  - *Điểm yếu:* Khi kho chỉ còn dư rất ít dung lượng sát trần `9.0 GB`, cuốn thứ 2 chạy song song có thể bị báo vượt trần `413` (Worker đã tự dọn rác an toàn); tốn băng thông upload đồng thời cao hơn một chút.
- **Phương án 2B (Chỉ tối ưu song song bên trong 1 cuốn, giữ up hàng loạt từng cuốn `1-1`):**
  - Ít tốn RAM nhất khi up lô lớn.
  - *Điểm yếu:* Lô 10–20 tập vẫn chậm hơn ~35–45% so với 2A.

### QĐ-3: Tối ưu tải ảnh & mở sách Khách trên Cloudflare Worker (`0` migration D1)
- **Phương án 3A (Khuyến nghị — Gộp D1 bằng `db.batch` + trả kèm chương đầu trong `/toc` + lưu sẵn danh sách chương cho ảnh ở gói mới & cache RAM isolate cho gói cũ):**
  - Gộp toàn bộ truy vấn kiểm tra quyền 3 tầng + đọc manifest trong `/toc`, `/chapters/:idx`, `/media/:idx` thành **1 lệnh `db.batch`** (rút từ 5–6 vòng D1 xuống 1 vòng).
  - Bổ sung tuỳ chọn `?includeChapter=<idx>` trên `/toc` (tương thích ngược 100%) để khách mở sách chỉ mất **1 lượt gọi mạng duy nhất** thay vì 2 lượt nối tiếp (vẫn áp đủ khoá chương, thuỷ vân 32-bit, AES-GCM, Token Bucket & thống kê `guest_chapter_reads`).
  - Với sách có khoá chương: gói mới gắn thêm danh sách `ch?: string[]` (chương chứa ảnh) ngay trong `manifest.media[i]` (kiểm tra tức thì `O(1)`, `0` đọc R2); gói cũ chưa có `ch` sẽ cache bản đồ `mediaIndex -> chapterKeys` theo `packKey` bất biến trong RAM Worker isolate để chỉ quét `.pack` tối đa **1 lần** thay vì quét lại cho từng ảnh.
  - Ở client khách: tải ảnh trong chương song song với giới hạn `concurrency = 3` (khớp `D-038`) và gom cập nhật kích thước ảnh để không tính lại Canvas layout quá nhiều lần.
  - *Điểm yếu:* Gói cũ (đã up từ trước) có khoá chương ở lần mở đầu tiên trên 1 Worker isolate mới khởi động vẫn mất 1 lần quét `.pack` (từ ảnh thứ 2 trở đi đạt `0ms`).
- **Phương án 3B (Chỉ gộp D1 `db.batch` + cache RAM isolate cho gói cũ, không gộp chương đầu vào `/toc` và không thêm `ch` vào manifest mới):**
  - Thay đổi API ít hơn.
  - *Điểm yếu:* Khách mở sách vẫn tốn 2 lượt gọi mạng nối tiếp, và gói mới có khoá chương vẫn chịu 1 lần quét `.pack` mỗi khi Worker khởi động lại.

---

## 3. Lộ trình triển khai (4 Phase nhỏ)

### Phase 1 — Tăng tốc mở sách phía Frontend (`src/lib/sanitizeHtml.ts`, `src/lib/parsers.ts`, `src/lib/docxParser.ts`, `src/lib/api.ts`, `src/hooks/useBookReader.ts`, `src/components/ReaderView.tsx`, `src/components/ReaderIllustrationGallery.tsx`, `src/types.ts`)
1. **Rút ngắn vòng parse/serialize EPUB từ 5–6 lần xuống 1–2 lần:**
   - Trong `src/lib/parsers.ts`: thêm đường nhanh cho `parseEpubXhtmlDocument` — chỉ gọi XML parser khi phát hiện thẻ tự đóng không phải void tag (như `<title/>`, `<a .../>`, `<div/>`), và bỏ hoàn toàn bước copy `htmlDoc.body.innerHTML = parsed.body.innerHTML` thừa.
   - Trong `src/lib/sanitizeHtml.ts`: kiểm chứng & chuyển `sanitizeBookDocument` sang sanitize trực tiếp DOM (`IN_PLACE: true`) giữ nguyên 100% danh sách cấm (`FORBIDDEN_BOOK_TAGS`, `FORBIDDEN_BOOK_ATTRS`) và thuộc tính cho phép (`ruby/rt/rp/rb`, `epub:type`, `role`, `svg image`).
   - Giải nén toàn bộ file XHTML trong `spineItems` **song song** (`Promise.all`) thay vì `for ... await` từng file.
2. **Nạp ảnh lười theo chương (`QĐ-1A`):**
   - Bổ sung tuỳ chọn `lazyMedia` & `initialChapterIndex` cho `parseBookBlob` (cả EPUB và DOCX): chỉ bung **song song** ảnh của chương mở đầu ngay lúc mở sách; các chương còn lại giữ `data-zip-path`, tự bung qua `parsedBook.ensureChapterMedia(idx)` khi chuyển chương + prefetch nhẹ chương kế tiếp ở nền.
   - Nâng cấp `ReaderIllustrationGallery.tsx` (nhánh Owner): nếu ảnh chưa có `blob:` URL, dùng `parsedBook.resolveMediaUrl(zipPath)` nạp lười khi thẻ ảnh cuộn vào khung nhìn (không bung ảnh đang bị che spoiler).
   - Đảm bảo `parsedBook.dispose()` thu hồi 100% `ObjectURL`, huỷ mọi promise đang chờ và xoá tham chiếu `JSZip`.
3. **Bỏ waterfall khi mở sách:**
   - Trong `fetchBookBlobCached` (`src/lib/api.ts`): ghi cache IndexedDB ở nền (`void setCachedBookBlob(...)`) thay vì chặn `return` chờ ghi xong 10–50 MB xuống đĩa (giữ `await` khi `strict` hoặc local upload).
   - Trong `useBookReader.ts`: gọi song song `fetchBookBlobCached` + `import('@/lib/parsers')` + `import('@/components/ActiveReaderHost')` + `import('@/components/ReaderView')` (hoặc `GuestCanvasReader` với khách), đảm bảo giữ gọn entry `index-*.js <= 86.04 kB` gzip (`D-013`).
- **Rủi ro & hoàn tác:** Rủi ro chính là EPUB viết sai chuẩn hoặc ảnh chưa sẵn sàng ở chế độ Lật trang (`ReaderPaginatedView`) → kiểm tra kỹ với nhiều mẫu EPUB/DOCX + chờ `ensureChapterMedia` xong trước khi đo cột. Hoàn tác sạch bằng `git revert` commit Phase 1.

### Phase 2 — Tăng tốc tải sách lên phía Frontend (`src/lib/parsers.ts`, `src/lib/guestPackBuilder.ts`, `src/lib/guestPackHtml.ts`, `src/lib/epubFootnotes.ts`, `src/lib/apiAdminMutations.ts`, `src/lib/uploadBatchHelpers.ts`, `src/components/UploadQueueList.tsx`)
1. **Đọc & mở ZIP đúng 1 lần duy nhất mỗi cuốn:**
   - `extractUploadMetadata` hỗ trợ nhận `arrayBuffer` / trả kèm `zip` tái sử dụng (hoặc nhận `reuseContext`) để `uploadBook` truyền thẳng sang `buildGuestPackEnvelope` → **0 lần đọc lại `file.arrayBuffer()`, 0 lần `JSZip.loadAsync` thứ 2**.
2. **Bỏ parse DOM trùng & nén gzip song song trong `guestPackBuilder.ts`:**
   - Truyền thẳng `Document` đã parse ở `convertChapterToGuestBlocks` sang `extractChapterFootnotesForGuestPack` (cắt hẳn 1 vòng `DOMParser` trên mỗi chương, giữ cache `WeakMap` cho chú thích chéo chương).
   - Nén `gzipCompressBytes` cho các segment song song theo lô (`concurrency = 6`) thay vì `for ... await` nối tiếp.
   - *(Nếu chốt QĐ-3A)* Ghi kèm danh sách `ch` (các `canonicalChapterKey` sử dụng ảnh) vào `manifest.media[i]`.
3. **Chạy song song trong từng cuốn & giữa các cuốn (`QĐ-2A`):**
   - Trong `uploadBook`: ngay sau bước trích bìa/tác giả, chạy song song `PUT /file` ∥ `setCachedBookBlob` ∥ `buildGuestPackEnvelope`; sau khi `PUT /file` hoàn tất, bắn song song `PUT /cover` ∥ `PUT /guest-pack` (cập nhật `storage` mới nhất từ phản hồi sau cùng).
   - Trong `executeSequentialUploadBatch`: tách nhẹ bước lập kế hoạch chia kệ cho lô để giữ nguyên 100% quy tắc gom sách lẻ `D-044`, chạy worker pool thích ứng (`concurrency = 2` cho file `<= 40 MB`, `1` cho file `> 40 MB`).
   - Memoize danh sách preview kệ/tác giả trong `UploadQueueList.tsx` để không quét lại kho sách mỗi lần progress cập nhật.
- **Rủi ro & hoàn tác:** Rủi ro race điều chỉnh trạng thái `storage` hoặc gom sách lẻ cùng tác giả khi up song song 2 cuốn → xử lý bằng hàng đợi tác vụ gọn + lock phần regroup metadata ngắn. Hoàn tác sạch bằng `git revert` commit Phase 2.

### Phase 3 — Tối ưu Cloudflare Worker cho Guest & Upload (`workers/r2-storage/src/bookChapterAccessDb.ts`, `workers/r2-storage/src/guestPack.ts`, `workers/r2-storage/src/guestRoutes.ts`, `workers/r2-storage/src/bookUploadRoutes.ts`, `src/lib/guestCrypto.ts`, `src/hooks/useGuestChapterStream.ts`)
1. **Gộp kiểm tra quyền 3 tầng + đọc manifest thành 1 `db.batch` duy nhất:**
   - Viết helper `loadGuestBookAccessAndPackBatch(db, auth, bookId)` trong `bookChapterAccessDb.ts` (hoặc `guestPack.ts`) gom truy vấn `books`, `book_access_rules`, `book_guest_grants`, `shelf_access_rules`, `shelf_guest_grants`, `chapter_access_rules`, `chapter_guest_grants` và `book_guest_packs` vào **1 round-trip D1** (thay cho 5–6 round-trip tuần tự).
   - Giữ nguyên 100% ngữ nghĩa phân quyền `D-030` & `D-042` (`public` override tập → `restricted` tập → `restricted` bộ → khoá chương).
2. **Gộp tải chương đầu vào `/toc` (`QĐ-3A`) & tối ưu tải ảnh Guest:**
   - `GET /api/guest/books/:id/toc?includeChapter=<idx>`: nếu hợp lệ và không bị rate-limit, trả kèm `initialChapter` đã áp thuỷ vân 32-bit + mã hoá `AES-256-GCM` + ghi `guest_chapter_reads`; client nạp sẵn vào `chapterCacheRef` của `useGuestChapterStream` để hiển thị ngay không cần gọi HTTP lượt 2.
   - Trong `parseAndValidateManifest` (`guestPack.ts`): chấp nhận trường tùy chọn `ch?: string[]` trên `manifest.media` (tương thích ngược hoàn toàn).
   - Trong `assertGuestMediaInUnlockedChapters` (`bookChapterAccessDb.ts`): ưu tiên kiểm tra `O(1)` từ `mediaMeta.ch`; với gói cũ chưa có `ch`, dùng cache LRU nhỏ (tối đa 32 `packKey`) trong RAM isolate Worker để chỉ giải nén `.pack` đúng 1 lần duy nhất cho mỗi cuốn.
   - Trong `useGuestChapterStream.ts`: tải ảnh minh hoạ trong chương **song song tối đa `3` ảnh** và gom `setImageSizes` theo batch nhỏ (`requestAnimationFrame` / theo lô) để giảm số lần tính lại `computeChapterCanvasLayout`.
3. **Cắt giảm D1 query khi Upload (`bookUploadRoutes.ts`, `guestPack.ts`):**
   - Gộp kiểm tra tồn tại + `getStorageStats` trước `R2.put` vào **1 `db.batch`**; gộp `INSERT/UPDATE` + đọc lại `SUM` dung lượng sau ghi vào **1 `db.batch`** (nếu vượt trần `9.0 GiB` do up song song → rollback xoá dòng D1 + xoá object R2 và trả `413`); dựng trực tiếp đối tượng `book` đã ghi thay vì chạy thêm `SELECT * FROM books`.
   - Rút tổng số vòng D1 mỗi cuốn upload từ ~18 vòng (27 query) xuống **4–6 vòng**.
- **Rủi ro & hoàn tác:** Cần deploy lại Worker (`npx wrangler deploy` trong `workers/r2-storage`) sau khi test sạch; vì không đổi schema D1 và tương thích ngược API 100%, có thể rollback phiên bản Worker trong 30 giây qua `wrangler rollback` hoặc `git revert`.

### Phase 4 — Kiểm thử toàn diện, đo tốc độ & Cập nhật tài liệu
- Chạy `npm run typecheck`, `npm run lint`, `npm run build` (xác minh `index-*.js <= 86.04 kB` gzip) và `npx tsc --noEmit` trong `workers/r2-storage`.
- Chạy test tự động:
  - Test parser EPUB (gồm file XHTML có `<title/>`, `<a id="fn1"/>`, `<ruby><rt>`, SVG, ảnh nhiều chương, kiểm tra XSS bị `DOMPurify` chặn sạch).
  - Test `guestPackBuilder` (tái sử dụng ZIP 1 lần, trích footnotes đầy đủ, ghi `media.ch` chuẩn xác).
  - Test logic phân quyền 3 tầng `db.batch` trên Worker (bộ khoá, tập đọc thử `public`, tập khoá riêng, chương khoá, ảnh thuộc chương khoá vs chương mở ở cả gói mới có `ch` và gói cũ không có `ch`).
  - Benchmark so sánh thời gian parse EPUB & build `guest-pack` trước/sau tối ưu.
- Kiểm thử trình duyệt thật: mở sách EPUB/DOCX (Cuộn dọc + Lật trang 2 cột + Tab Minh hoạ + Highlight + Footnotes + đóng/mở nhiều lần không rò rỉ ObjectURL), luồng Upload nhiều tập, và luồng Guest (mở sách, lật chương, tải ảnh, chương khoá).
- Deploy Worker (nếu người dùng xác nhận) và cập nhật `docs/DECISIONS.md` (`D-045`), `docs/ARCHITECTURE.md`, `HANDOFF.md` trong cùng commit.

---

## 4. Checklist kiểm thử bắt buộc trước khi xem là xong
- [x] `npm run typecheck`, `npm run lint` (`0/0`, mọi tệp `<= 500` dòng), `npm run build` (`index-*.js = 85.92 kB <= 86.04 kB` gzip) và `npx tsc --noEmit` trong `workers/r2-storage` đều sạch lỗi.
- [x] **Owner mở sách EPUB & DOCX:**
  - Mở đúng chương đang đọc dở (hoặc chương 0) với ảnh minh hoạ hiển thị đầy đủ ngay ở cả chế độ Cuộn dọc và Lật trang 2 cột (`D-011`).
  - Lật sang chương tiếp theo & chương xa có ảnh minh hoạ hiển thị mượt, không lỗi ảnh vỡ.
  - Mở Tab **Minh hoạ**: ảnh đã đọc hiện đầy đủ, ảnh chương chưa đọc vẫn che spoiler (và bung đúng khi bấm hé mở).
  - Chú thích (Footnotes), Highlight, Tìm chữ trong sách, Furigana `<ruby><rt>` và Lightbox hoạt động bình thường.
  - EPUB có thẻ tự đóng `<title/>`, `<a id="fn1"/>` và thẻ độc hại `<script>`/`onerror`/`javascript:` vẫn hiển thị đủ chữ & bị lọc sạch XSS.
  - Đóng sách / chuyển sách liên tiếp thu hồi sạch toàn bộ `URL.revokeObjectURL`.
- [x] **Upload sách (đơn lẻ & hàng loạt):**
  - Upload 1 cuốn & lô nhiều cuốn EPUB/DOCX hoàn tất đủ: file R2, ảnh bìa `-v2.jpg`, tác giả (`D-044`), chọn kệ đúng (`D-044`), `guest_ready = true`, cache IndexedDB.
  - Upload lô 2 cuốn lẻ cùng tác giả vẫn tự gom kệ chính xác; file `> 40 MB` tự hạ về `concurrency = 1`.
  - Vượt hạn mức `9.0 GiB` vẫn bị chặn `413` và dọn sạch R2/D1 không để rác.
- [x] **Guest Discord & Worker:**
  - Mở sách chỉ gọi 1 lượt `/toc?includeChapter=...` và hiển thị ngay chương đầu (vẫn giữ thuỷ vân Visible + Forensic 32-bit, AES-GCM, Token Bucket).
  - Phân quyền 3 tầng (`Bộ → Tập → Chương`) hoạt động chính xác 100%: chặn `403` tập/chương khoá, chặn `403` ảnh chỉ thuộc chương khoá ở cả gói mới lẫn gói cũ, cho phép ảnh thuộc chương mở.
  - Tải chương nhiều ảnh minh hoạ chạy song song mượt (`concurrency = 3`), không dính `429` oan.
- [x] Cập nhật `docs/DECISIONS.md` (`D-045`), `docs/ARCHITECTURE.md` và `HANDOFF.md` trong cùng commit.
