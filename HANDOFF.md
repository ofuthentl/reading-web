# HANDOFF
Cập nhật: 2026-11-25 12:10 | Nhánh: feat/upgrade-author-and-shelf-matching | Build: 🟢 XANH (`index-*.js = 85.80 kB` gzip <= `86.04 kB`)
Nhiệm vụ hiện tại: **Nâng cấp tách/lọc tên tác giả & tự động chọn kệ (`D-044` — chốt `1A`, `2A`, `3A`, tách từ `fix/toc-layout-and-numbering` đã gồm `D-043`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/upgrade-author-and-shelf-matching.md

## Đang làm dở
- Không có — toàn bộ tính năng đã qua 35+ test tự động, `typecheck`, `lint`, `build` và kiểm thử trình duyệt thật (`0` lỗi console), sẵn sàng push/mở PR merge vào `main`.

## Xong trong nhánh này
1. **Lõi lọc rác tác giả & phân tích tên tệp nạp lười (`src/lib/authorHeuristics.ts`, `src/lib/seriesShelfExtractor.ts`, `src/lib/shelfPlacement.ts`, `src/lib/bookMetadata.ts`):**
   - Lọc sạch nhãn nhóm dịch/nguồn/định dạng/calibre (`[Hako]`, `Sonako`, `Full`...), chặn tiêu đề phụ tiếng Việt trên bộ tên ngoại ngữ và gộp trọn các vế tới nhãn tập cuối cùng (`Mushoku Tensei - Thất Nghiệp Chuyển Sinh - Tập 1`).
   - Tách `seriesShelfExtractor.ts` sang chunk nạp lười giữ `index-*.js = 85.80 kB` gzip (`<= 86.04 kB`, `D-013`).
2. **Sửa triệt để tự động chọn kệ (`src/lib/shelfUploadPlanner.ts`):**
   - Khớp chính xác (`normalizeShelfMatchKey` bỏ dấu câu thừa 2 đầu) luôn thắng tuyệt đối, không bị kệ `isRenamed` đè lên; tách bạch 2 chiều bộ chính (`Unnamed Memory`, `Mushoku Tensei`) với hậu truyện/ngoại truyện nhiều tập (`Unnamed Memory -after the end-`, `Mushoku Tensei - Redundancy` / `Ngoại Truyện`), đồng thời vẫn khớp an toàn kệ đổi tên song ngữ duy nhất (`Mushoku Tensei - Thất Nghiệp Chuyển Sinh`).
3. **Luồng Upload thông minh & Bộ lọc Tác giả đồng bộ theo kệ (`parsers.ts`, `apiAdminMutations.ts`, `uploadBatchHelpers.ts`, `UploadQueueList.tsx`, `libraryFiltering.ts`, `useLibraryViewState.ts`, `shelfSummary.ts`, `libraryHealthAudit.ts`, `epubSummaryExtractor.ts`):**
   - Đọc kèm `<dc:creator>` sạch ngay trong lần mở ZIP trích bìa (`extractUploadMetadata`, `0` lần mở ZIP thêm), ưu tiên kế thừa tác giả thống nhất của kệ đích (`resolveShelfConsistentAuthor`) và tự gom trả tiêu đề phụ riêng từng tập cùng lô (`healBatchParsedMetadata`).
   - Đồng bộ `buildShelfAuthorContext` & `splitNormalizedAuthors` cho Bộ lọc Tác giả (`collectAvailableAuthors`, `matchesBookAuthor`) và Kiểm tra sức khoẻ kho sách (không tự ghi đè D1).

## Bước tiếp theo
1. Push nhánh `feat/upgrade-author-and-shelf-matching` (hoặc merge PR `fix/toc-layout-and-numbering` trước rồi mở PR cho nhánh này) vào `main` để tự động deploy frontend lên `https://ofu.lol` (không cần re-deploy Worker hay migration D1/R2).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ngoài Git ở thư mục gốc.
