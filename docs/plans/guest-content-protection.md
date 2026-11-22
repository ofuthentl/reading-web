# Kế hoạch Triển khai — Bảo vệ Nội dung Sách chống Crawl / Đánh cắp ở Chế độ Khách (`feat/guest-content-protection`)

> **Nhánh triển khai:** `feat/guest-content-protection` (tách từ `main` sau PR #8).
> **Quyết định kiến trúc:** **`D-028`** trong `docs/DECISIONS.md` (mở rộng `D-026` & `D-027`).
> **Trạng thái:** **Đã hoàn tất triển khai Phase 1 → 4 & vượt qua 100% bài kiểm định E2E (`workerd + D1 + R2 + AES-GCM + Forensic 32-bit`)** — sẵn sàng migrate D1 remote, deploy Worker & mở PR vào `main`.

---

## 1. Mục tiêu & Nguyên tắc Thiết kế

Khắc chế toàn diện cả 4 tầng tấn công được phân tích từ mã nguồn `OfuCrawl` (`A EPUB book\tool`: `core.py`, `novest.py`, `novest_browser.py`, `novest_ocr.py`), tối ưu chuyên sâu cho **`.epub` và `.docx`** (không can thiệp thêm vào `.pdf` theo yêu cầu), đồng thời đảm bảo:

1. **Tài khoản Admin (`owner`) giữ nguyên 100% trải nghiệm hiện tại:**
   - Admin vẫn đọc bằng `ReaderView` DOM mượt + Cache IndexedDB `0ms` + Thế giới 3D Aincrad, không bị khoá chọn chữ hay giảm tốc độ dù chỉ 1%.
2. **Phiên Khách Discord (`guest`) không bao giờ chạm được vào file sách gốc:**
   - Chặn cứng **`403 Forbidden`** tại `GET /api/files/books/*` đối với `guest`; ẩn trường `file_key` trong `GET /api/books` trả cho `guest`; ngắt hoàn toàn việc lưu dữ liệu sách xuống IndexedDB / `localStorage` ở chế độ `guest` (chỉ giữ ảnh bìa thumbnail `covers/*` ~40 KB trên kệ).
   - Thay vì tải cả cuốn sách, khách chỉ nhận được **từng chương lẻ** và **từng ảnh minh hoạ lẻ** đã mã hoá `AES-256-GCM` theo khoá phiên ngắn hạn (`Cache-Control: no-store`, không xem hay lưu ảnh được từ tab F12 Network, không tạo `blob:` URL trên DOM).
3. **Không nhân bản ảnh trên R2 & Không vượt trần `10 ms` CPU của Cloudflare Worker Free Tier (`$0`):**
   - Khi Admin tải sách `EPUB`/`DOCX` lên (kèm nút **Đồng bộ bảo mật 1 chạm** ngay trên trình duyệt Admin cho các sách cũ đã có sẵn trên R2), trình duyệt Admin tạo 1 gói văn bản chương nén `guest-packs/<bookId>.pack` (~80–150 KB/tập, chỉ ~0.5% dung lượng, được cộng đầy đủ vào hạn mức cứng `9.0 GiB` của `D-002`) và ghi lại toạ độ `[dataOffset, byteLength, compression]` của từng ảnh minh hoạ nằm sẵn bên trong file `.epub`/`.docx` gốc (**0 byte nhân bản ảnh**).
   - Khi `guest` mở 1 chương hoặc 1 ảnh, Worker chỉ đọc đúng đoạn byte-range nhỏ tương ứng từ R2, nhúng thuỷ vân ẩn và mã hoá `AES-256-GCM` bằng Web Crypto C++ gốc (`< 1 ms` CPU/request).
4. **Chống tua tự động thông minh (Token Bucket — KHÔNG đặt hạn ngạch tổng chương/ngày):**
   - Ràng buộc phiên `guest` với mã băm `User-Agent` lúc đăng nhập (chặn rút Bearer token từ Chrome ném sang script Python `requests`).
   - Rổ `burst = 10` chương mới liên tiếp (cho phép bạn bè bấm dò mục lục, xem minh hoạ, tìm chương đang đọc dở tức thì không khựng) + cache RAM tối đa `12` chương vừa mở trong phiên để lật `Trước` ↔ `Sau` `0ms` không tốn lượt.
   - Tốc độ hồi tự nhiên: `1 chương mới / 6 giây` (`10 chương/phút`) và **không giới hạn tổng số chương/tập đọc trong 24 giờ** — người đọc thật cày bao nhiêu tập cả ngày lẫn đêm cũng không bao giờ chạm tường; chỉ script cào liên thanh mới dính `429` (cố tình spam vượt ngưỡng lỗi liên tiếp sẽ tự tạm khoá phiên).
5. **Trình đọc `<canvas>` nhiễu vân giấy (`GuestCanvasReader`) + Thuỷ vân Kép định danh Discord:**
   - **Vô hiệu hoá `novest_browser.py`:** Chữ (có giữ nguyên **in đậm**, *in nghiêng*, tiêu đề, trích dẫn, ngắt cảnh) và ảnh minh hoạ được vẽ trực tiếp lên các tấm `<canvas>` theo khung nhìn hiện tại → **0 thẻ `<p>`, 0 `<img>`, 0 text node trong DOM**; khoá `toDataURL` / `toBlob` / `getImageData`; chống Save HTML / SingleFile / Print (`@media print`). Vẫn đổi được cỡ chữ, độ rộng cột và đủ 4 bảng màu (`paper`, `sepia`, `dark`, `midnight`).
   - **Phá tách nền `novest_ocr.py`:** Phủ vân sợi giấy + sóng độ sáng biến thiên mượt (`ΔL ≈ 20–28`) dưới chân chữ khiến thuật toán lấy pixel `(0, 0)` lệch `>= 18` của Tesseract bị vỡ khung cắt chữ, trong khi mắt người đọc vẫn thấy dịu như giấy sách in.
   - **Thuỷ vân nổi + Thuỷ vân ẩn 32-bit (`Forensic Watermark`):**
     - *Lớp nổi trên Canvas:* Chữ chìm nghiêng mờ `discord_username · #xxxx` chạy xuyên qua cả nền chữ và ảnh minh hoạ (nếu tool cào fallback nhúng ảnh đoạn văn vào EPUB như `novest_ocr.py` hay chụp màn hình phát tán, tên Discord hiện ngay trên ảnh).
     - *Lớp ẩn trong văn bản:* Trước khi mã hoá chương trên Worker, nhúng chữ ký 32-bit phái sinh từ `HMAC-SHA256(AUTH_SECRET, discord_user_id)` vào các cặp dấu thanh/dấu câu đồng nghĩa chuẩn tiếng Việt (`hoá`/`hóa`, `khoá`/`khóa`, `hoà`/`hòa`, `tuỳ`/`tùy`, `thuỷ`/`thủy`, `…`/`...`, `–`/`—` — không đổi nghĩa dù 1 chữ). Kể cả khi kẻ gian chụp màn hình rồi dùng AI OCR đọc lại thành `.txt`/`.epub`, Admin dán đoạn văn bị lộ vào công cụ kiểm tra sẽ tìm ra chính xác tài khoản Discord đã tuồn truyện để khoá vĩnh viễn.

---

## 2. Thiết kế Dữ liệu (`D1` + `R2`) & Giao thức API

### 2.1. Migration D1 (`workers/r2-storage/migrations/0004_guest_protection.sql`)
Giữ nguyên toàn bộ dữ liệu hiện có, bổ sung bảng chỉ mục gói đọc khách `book_guest_packs` và mở rộng trạng thái bảo vệ trên bảng `discord_access`:

```sql
-- Chỉ mục gói chương & toạ độ byte-offset ảnh trong ZIP cho chế độ khách (1 dòng / sách EPUB hoặc DOCX)
CREATE TABLE IF NOT EXISTS book_guest_packs (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL,
  pack_size INTEGER NOT NULL DEFAULT 0,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  manifest_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Bổ sung cột quản lý chống bot, ràng buộc trình duyệt & khoá vi phạm trên discord_access
ALTER TABLE discord_access ADD COLUMN ua_hash TEXT;
ALTER TABLE discord_access ADD COLUMN rl_tokens REAL NOT NULL DEFAULT 10;
ALTER TABLE discord_access ADD COLUMN rl_updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_access ADD COLUMN rl_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_access ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_access ADD COLUMN ban_reason TEXT;
```

*(Lưu ý an toàn runtime: Helper `ensureGuestProtectionSchema(db)` trên Worker tự kiểm tra/khởi tạo bảng & cột nếu chưa kịp chạy lệnh migrate thủ công để không bao giờ lỗi `500`.)*

### 2.2. Cấu trúc Gói `guest-packs/<bookId>.pack` trên R2
- Gồm các khối `gzip(JSON({ title, blocks }))` nối tiếp nhau của từng chương `0..N-1`.
- `manifest_json` lưu trong `book_guest_packs` (~2–12 KB/cuốn):
  - `v: 1`
  - `chapters: Array<{ id: string; title: string; offset: number; length: number }>` (vị trí byte-range trong `guest-packs/<bookId>.pack`).
  - `media: Array<{ offset: number; length: number; compression: 0 | 8; mime: string }>` (vị trí byte-range dữ liệu thô/deflate của ảnh ngay bên trong `books/<bookId>.epub` hoặc `books/<bookId>.docx` gốc — **0 byte ảnh trùng lặp**).

### 2.3. Các API mới / cập nhật trên Cloudflare Worker
| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| `GET` | `/api/books` | Owner + Guest | Trả kèm `guestReady: boolean` cho mỗi sách và `session.watermarkLabel` (vd `ofu_reader · #4821` cho `guest`). Với `guest`, xoá rỗng `file_key: ''` để không lộ đường dẫn R2. |
| `GET` / `HEAD` | `/api/files/:key` | **Cập nhật** | `covers/*`: cho phép `Owner + Guest`. **`books/*`: bắt buộc `requireOwner(auth)` (`403` cho `guest`)**. |
| `PUT` | `/api/books/:id/guest-pack` | Chỉ Owner | Nhận binary `guest-packs/<id>.pack` + header/metadata `manifest`, kiểm tra hạn mức `9.0 GiB`, lưu R2 + D1 `book_guest_packs`. |
| `GET` | `/api/guest/books/:id/toc` | Owner + Guest | Trả danh sách mục lục chương `{ bookId, chapters: [{ id, title, chapterNumber }], watermarkLabel }` từ D1 (`0` lượt đọc R2). |
| `GET` | `/api/guest/books/:id/chapters/:index` | Owner + Guest | Kiểm tra `is_banned` + `ua_hash` + Token Bucket; đọc byte-range chương từ `pack_key`, giải nén, nhúng thuỷ vân 32-bit theo `discord_user_id`, mã hoá `AES-256-GCM` theo phiên và trả `{ iv, nonce, data }`. |
| `GET` | `/api/guest/books/:id/media/:mediaIndex` | Owner + Guest | Đọc byte-range ảnh trực tiếp từ `books/<id>.epub\|.docx` (tự giải nén `deflate-raw` nếu `compression === 8`), mã hoá `AES-256-GCM` trả `application/octet-stream` (`X-Guest-Iv`, `X-Guest-Nonce`, `X-Guest-Mime`). |
| `GET` | `/api/admin/discord-guests` | Chỉ Owner | Liệt kê danh sách thành viên Discord đã từng lấy key (`discord_user_id`, `discord_username`, `is_banned`, `rl_strikes`, `updated_at`). |
| `POST` | `/api/admin/discord-guests/:userId/ban` | Chỉ Owner | Khoá hoặc mở khoá quyền truy cập/lấy key của 1 `discord_user_id` (đóng ngay phiên đang mở nếu khoá). |
| `POST` | `/api/admin/forensic-check` | Chỉ Owner | Nhận đoạn văn bản nghi bị rò rỉ → trích bit thuỷ vân và chấm điểm đối chiếu toàn bộ thành viên trong `discord_access`, trả danh sách nghi phạm kèm độ khớp `%` và số bit đọc được. |

---

## 3. Chia Phase Triển khai, Rủi ro & Cách hoàn tác

*(Mọi file tạo mới hoặc chỉnh sửa đều tuân thủ nghiêm ngặt giới hạn `<= 500` dòng hiệu dụng của ESLint `max-lines` theo `AGENTS.md` §5.)*

### Phase 1 — Hạ tầng Bảo vệ trên Cloudflare Worker (Chặn `403` file gốc, Token Bucket, Mã hoá phiên & Thuỷ vân 32-bit)
- **File tạo / sửa:**
  - Tạo `workers/r2-storage/migrations/0004_guest_protection.sql` & cập nhật `workers/r2-storage/schema.sql`.
  - Tạo `workers/r2-storage/src/forensicWatermark.ts` (`<= 210` dòng): sinh chuỗi 32-bit từ `HMAC-SHA256(secret, discordUserId)`, nhúng vào mảng văn bản chương qua các cặp dấu thanh/dấu câu đồng nghĩa tiếng Việt (giữ nguyên 100% ngữ nghĩa) và hàm ` matchForensicCandidates` truy vết ngược từ văn bản rò rỉ.
  - Tạo `workers/r2-storage/src/guestPack.ts` (`<= 340` dòng): quản lý bảng `book_guest_packs`, tính gộp `pack_size` vào `getStorageStats`, Token Bucket chống bot trên `discord_access` (`burst = 10`, hồi `1 token / 6s`, không trần ngày), cắt byte-range chương/ảnh từ R2 và mã hoá `AES-256-GCM` bằng khoá phái sinh từ chữ ký phiên + `nonce`.
  - Sửa `workers/r2-storage/src/auth.ts`, `workers/r2-storage/src/discord.ts`, `workers/r2-storage/src/booksDb.ts`, `workers/r2-storage/src/index.ts`:
    - Chặn tài khoản `is_banned = 1` ngay từ lúc bấm chuông Discord (`/key` / nút `🔔`) lẫn lúc gọi API.
    - Lưu & đối chiếu `ua_hash` cho phiên `guest`; trả thêm `discordUsername` / `watermarkLabel` trong `AuthContext`.
    - Đặt `requireOwner(auth)` cho `GET/HEAD /api/files/books/*`; ẩn `file_key` với `guest` trong `GET /api/books`; tự xoá `guest-packs/<id>.pack` khi xoá sách đơn hoặc xoá hàng loạt.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Các cột mới trên `discord_access` chưa có trên DB cũ khi vừa deploy Worker. *Giảm thiểu:* Hàm khởi tạo kiểm tra `PRAGMA table_info(discord_access)` 1 lần đầu trên isolate và chạy `ALTER TABLE` bù tự động cho cột còn thiếu.
  - *Rủi ro:* Vượt `10 ms` CPU Worker. *Giảm thiểu:* Chỉ giải nén/mã hoá đúng 1 chương nhỏ (~10–25 KB) bằng luồng C++ `DecompressionStream` & `crypto.subtle`.
- **Cách hoàn tác:** `git revert` commit Phase 1 và deploy lại Worker; bảng `books` và toàn bộ file `books/*` gốc của Admin không hề bị thay đổi.

### Phase 2 — Bộ Đóng gói `GuestPack` (`EPUB` & `DOCX`, 0 nhân bản ảnh) & Tích hợp Lúc Upload
- **File tạo / sửa:**
  - Cập nhật `src/types.ts`: bổ sung `guest_ready?: boolean` vào `Book`, `watermarkLabel?: string` vào `AuthSessionInfo`, và các kiểu `GuestInlineSpan`, `GuestBlock`, `GuestChapterPayload`, `GuestTocItem`.
  - Tạo `src/lib/zipDirectory.ts` (`<= 140` dòng): đọc PKZIP End of Central Directory & Local File Header trực tiếp trên `ArrayBuffer` trong `< 1 ms` để lấy chính xác `{ dataOffset, byteLength, compression }` của từng tệp ảnh bên trong `.epub`/`.docx`.
  - Tạo `src/lib/guestPackBuilder.ts` (`<= 320` dòng): trích xuất danh sách chương sạch từ `.epub` (tái sử dụng `buildEpubChapters` + `sanitizeBookDocument`) và `.docx` (tái sử dụng `docxXml.ts` + logic chia chương chuẩn), chuyển thành `GuestBlock[]` giữ nguyên chữ đậm/nghiêng/heading/quote/ảnh, nén `CompressionStream('gzip')` từng chương và ghép thành gói upload lên `PUT /api/books/:id/guest-pack`.
  - Tạo `src/lib/guestCrypto.ts` (`<= 130` dòng): giải mã `AES-256-GCM` chương và ảnh ngay trên RAM bằng chữ ký token hiện tại, giải mã ảnh thẳng ra `ImageBitmap` (xoá sạch buffer trung gian, `0` `ObjectURL`).
  - Sửa `src/lib/api.ts`:
    - Tự động tạo và đẩy `guest-pack` ngay cuối hàm `uploadBook()` khi `fileType === 'epub' || fileType === 'docx'` ở Cloud Mode.
    - Ngắt hoàn toàn đọc/ghi cache sách IndexedDB khi `session.role === 'guest'` và thêm hàm gọi API đọc chương/ảnh cho `guest`.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Tệp EPUB/DOCX dị biệt lỗi khi sinh `guest-pack` làm hỏng luồng upload sách chính của Admin. *Giảm thiểu:* Bọc bước sinh `guest-pack` trong `try/catch` không chặn upload chính (giống bước nén ảnh bìa hiện tại) và báo rõ để có thể thử lại.
- **Cách hoàn tác:** `git revert` commit Phase 2.

### Phase 3 — Trình đọc `<canvas>` 2D Nhiễu Vân Giấy (`GuestCanvasReader`) cho Chế độ Khách
- **File tạo / sửa:**
  - Tạo `src/lib/guestCanvasLayout.ts` (`<= 280` dòng): bộ dàn trang & ngắt dòng tiếng Việt trên Canvas 2D hỗ trợ đoạn văn có run thường / **đậm** / *nghiêng*, tiêu đề chương/mục, trích dẫn, dải phân cảnh và khung ảnh minh hoạ giữ đúng tỉ lệ gốc; tính chiều cao tổng và tìm nhanh các dòng nằm trong viewport.
  - Tạo `src/lib/guestCanvasPaint.ts` (`<= 230` dòng): vẽ nền giấy sợi hữu cơ + sóng độ sáng biến thiên (phá ngưỡng cắt nền `(0, 0)` của `novest_ocr.py`) + lưới thuỷ vân chéo mờ `watermarkLabel` xuyên qua cả chữ lẫn ảnh minh hoạ trên đủ 4 bảng màu `paper` / `sepia` / `dark` / `midnight`; khoá cứng `toDataURL`, `toBlob`, `getImageData` trên phần tử `<canvas>`.
  - Tạo `src/components/GuestCanvasReader.tsx` (`<= 380` dòng, nạp lười qua `React.lazy` — **`0 B` tăng thêm ở gói entry chính**):
    - Giữ đồng bộ thanh header mảnh, ngăn kéo mục lục `ReaderTocDrawer`, bảng chỉnh chữ/nền `ReaderSettingsPopover` và lưu tiến độ đọc `guest_reading_progress` giống hệt trình đọc gốc.
    - Chia vùng đọc thành các tấm `<canvas>` ảo hoá theo khung nhìn (chỉ vẽ phần đang nhìn thấy trên màn hình, thu hồi `ImageBitmap.close()` khi đóng chương/unmount).
    - Cache tối đa `12` chương vừa đọc trong RAM phiên (lật lại `0ms` không gọi mạng), tự động làm mờ trang khi cửa sổ bị ẩn/chuyển tab và ẩn trắng khi bấm Print (`@media print`).
  - Sửa `src/hooks/useBookReader.ts` & `src/App.tsx`:
    - Phân nhánh sạch theo `session.role`: `owner` giữ nguyên `fetchBookBlobCached` + `parseBookBlob` + `ReaderView` (`0ms` cache); `guest` nạp mục lục từ `/api/guest/books/:id/toc` và mở `LazyGuestCanvasReader` (kèm thông báo lịch sự nếu gặp sách `.pdf` hoặc sách cũ Admin chưa bấm đồng bộ).
    - Khi `guest` đăng xuất hoặc hết hạn 24 giờ: dọn sạch bộ nhớ đệm và trạng thái đọc trên máy.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Ngắt dòng Canvas chậm với chương rất dài (`> 15.000` chữ). *Giảm thiểu:* Cache độ rộng từ theo font trong `Map` để dàn lại cả chương 5.000 chữ chỉ mất `~3–6 ms` trên điện thoại, và chỉ vẽ các dòng lọt trong viewport + đệm `400px`.
- **Cách hoàn tác:** `git revert` commit Phase 3.

### Phase 4 — Công cụ Quản trị Bảo mật (`AdminProtectionModal`: Đồng bộ 1 chạm + Truy vết rò rỉ) & Kiểm định Toàn diện
- **File tạo / sửa:**
  - Tạo `src/components/AdminProtectionModal.tsx` (`<= 320` dòng, `React.lazy` chỉ nạp khi `owner` bấm mở):
    1. **Tab Đồng bộ Gói Bảo mật Khách:** Hiển thị tiến độ `X / Y sách EPUB & DOCX đã sẵn sàng cho khách`, nút **Đồng bộ tất cả sách chưa có gói** chạy tuần tự ngay trên trình duyệt Admin (tận dụng luôn cache IndexedDB sẵn có của Admin, có nút Dừng an toàn).
    2. **Tab Truy vết Rò rỉ & Quản lý Khách Discord:** Ô dán văn bản nghi bị đánh cắp → bấm **Quét dấu vân tay** hiển thị thành viên Discord khớp chữ ký 32-bit kèm tỉ lệ chính xác; bảng danh sách thành viên Discord đã từng lấy key kèm nút **Khoá / Mở khoá** tức thì.
  - Sửa nhẹ `src/components/LibraryHeader.tsx` & `src/App.tsx`: thêm nút biểu tượng Khiên bảo mật (kèm chấm báo nhỏ nếu còn sách EPUB/DOCX cũ chưa tạo gói khách) chỉ hiển thị cho `owner`.
  - Viết bộ kiểm thử tự động E2E (`workerd + D1 + R2` & unit test parser ZIP/Canvas/Watermark), chạy toàn bộ cổng chất lượng `AGENTS.md` §7 và cập nhật `docs/ARCHITECTURE.md` + `HANDOFF.md`.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Đóng cửa sổ giữa chừng khi đang đồng bộ hàng loạt sách cũ. *Giảm thiểu:* Mỗi cuốn lưu độc lập trên R2/D1; mở lại chỉ chạy tiếp các cuốn còn thiếu (`!book.guest_ready`).
- **Cách hoàn tác:** `git revert` commit Phase 4.

---

## 4. Checklist Kiểm thử (`AGENTS.md` §7)

- [x] **Chặn tải file gốc tuyệt đối:** Dùng token `guest` gọi thẳng `GET /api/files/books/<id>.epub` hoặc `.docx` hoặc `.pdf` → bị chặn **`403 Forbidden`**; gọi `GET /api/books` không còn lộ `file_key`; mở F12 Application → IndexedDB không lưu bất kỳ blob sách nào.
- [x] **Chặn xem trộm qua F12 Network:** Mở chương & ảnh minh hoạ ở chế độ `guest` → mọi phản hồi chương và ảnh trong tab Network đều là dữ liệu mã hoá `AES-256-GCM` ngẫu nhiên mỗi lượt (`no-store`), không xem trước hay bấm chuột phải lưu ảnh được.
- [x] **Chặn `novest_browser.py` (DOM = 0 chữ/ảnh):** Mở trình đọc `guest`, kiểm tra DOM (`document.querySelector('main').innerText` và `querySelectorAll('img')`) → rỗng 100%, chỉ có `<canvas>` vùng nhìn thấy; gọi `canvas.toDataURL()` từ Console trả rỗng/lỗi bảo vệ; bấm `Ctrl+P` in trang không lộ chữ.
- [x] **Chống `novest_ocr.py` & Thuỷ vân nổi:** Nền giấy trên `<canvas>` hiển thị êm dịu ở cả 4 chế độ `paper`/`sepia`/`dark`/`midnight` kèm sóng độ sáng + chữ chìm `discord_username · #xxxx` xuyên qua cả chữ và ảnh minh hoạ; đổi cỡ chữ/độ rộng cột tự dàn dòng mượt trên cả Desktop & Mobile.
- [x] **Token Bucket không giới hạn ngày:** Khách mở sách bấm lướt nhanh 10 chương đầu tìm chỗ đọc → mở tức thì `0s` chờ; lật qua lại các chương vừa xem → `0ms` từ RAM; đọc bình thường cả ngày hàng chục chương không bao giờ bị chặn; chạy vòng lặp script gọi liên tục 15+ chương mới trong vài giây → bị chặn `429` đúng thiết kế.
- [x] **Truy vết rò rỉ 32-bit chính xác:** Lấy văn bản chương xuất cho tài khoản Discord A (kể cả sau khi xoá sạch định dạng, chỉ giữ chữ thuần như kết quả AI OCR), dán vào `AdminProtectionModal` → chỉ điểm đúng tài khoản Discord A với độ khớp cao vượt trội so với các tài khoản khác; bấm **Khoá** tài khoản A → phiên 24h đang mở của A đóng ngay lập tức (`401`/`403`) và A không lấy được key mới trên Discord.
- [x] **Admin (`owner`) không bị ảnh hưởng:** Đăng nhập bằng `ACCESS_PASSCODE` → giữ nguyên 100% `ReaderView` DOM + Cache IndexedDB `0ms` + Thế giới 3D Aincrad; upload sách EPUB/DOCX mới tự động bật `guest_ready = true`; nút đồng bộ hàng loạt xử lý mượt các sách cũ.
- [x] **Chuẩn kỹ thuật XANH 100%:** `npm run typecheck`, `npm run lint` (0 lỗi, mọi file `<= 500` dòng), `npm run build` (entry `index-*.js = 77.11 kB <= 86.04 kB gzip`, `0 B three`), `npx tsc --noEmit` trong `workers/r2-storage` đều sạch lỗi.
