# Kế hoạch Triển khai — Chia sẻ Thư viện qua Bot Discord (Key 5 phút · Phiên 24 giờ · Guest Chỉ Đọc 2D)

> **Nhánh triển khai:** `feat/discord-key-access` (tách từ `main`).
> **Quyết định kiến trúc:** **`D-026`** trong `docs/DECISIONS.md` (cập nhật `D-003`).
> **Trạng thái:** **Đã hoàn tất triển khai Phase 1 → 4 & vượt qua 100% bài kiểm thử tự động** — sẵn sàng gắn Discord App, migrate D1 remote, deploy Worker & mở PR vào `main`.

---

## 1. Mục tiêu & Quy tắc cốt lõi đã chốt

1. **Giữ nguyên 100% giao diện & thương hiệu Ofu's Library hiện có:**
   - Không copy-paste giao diện của TMW Archive, không thay thế bố cục vốn có.
   - Màn hình `AuthGate.tsx` giữ nguyên thẻ đăng nhập hiện tại với **1 ô nhập duy nhất** nhận được cả 2 loại mã:
     - **Mật mã Admin (`ACCESS_PASSCODE`):** cấp phiên `owner` hiệu lực **30 ngày** — toàn quyền quản trị kho sách/kệ + mở khoá Thế giới **3D Aincrad**.
     - **Chìa khoá Discord (`12` ký tự chữ hoa + số, vd `XN9D42ZZFZ66`):** chỉ dùng được **1 lần duy nhất** trong vòng **5 phút** kể từ lúc bấm chuông trên Discord; sau khi nhập thành công sẽ cấp phiên `guest` hiệu lực **24 giờ**.
2. **Bot Discord chạy trực tiếp trên Cloudflare Worker (`$0`, online 24/7, 0 thư viện ngoài):**
   - Route `POST /api/discord/interactions` xác thực chữ ký `Ed25519` chuẩn của Discord bằng Web Crypto API (`crypto.subtle.verify('Ed25519', ...)`).
   - Lệnh `/setup-bell` (chỉ Admin trong server Discord dùng được) để bot đăng bảng thông báo cố định kèm nút bấm **`🔔 Nhận chìa khoá`** vào kênh Discord chỉ định.
   - Bất kỳ thành viên nào thuộc **Discord Server được phép (`DISCORD_GUILD_ID`)** bấm nút `🔔` sẽ nhận tin nhắn ẩn (**ephemeral**, `flags: 64` — chỉ người bấm nhìn thấy) chứa mã key 12 ký tự hạn 5 phút.
   - **Chống share key (giống TMW — *"Any other door you had open closes"*):** Mỗi `discord_user_id` chỉ có tối đa 1 key chờ (5 phút) và **1 phiên 24 giờ đang mở** tại một thời điểm. Đổi key mới thành công sẽ lập tức vô hiệu hoá phiên 24 giờ cũ của tài khoản Discord đó.
3. **Phân quyền cứng `owner` vs `guest` (cả Backend Worker lẫn Frontend UI):**
   - **`guest` (bạn bè vào bằng key Discord 24h):**
     - **Chỉ đọc 2D:** ẩn công tắc `2D/3D`, ép `effectiveMode = '2d'`, **không bao giờ tải/mount `Library3DHost` hay `three`** (tiết kiệm băng thông & giữ đặc quyền 3D cho Admin).
     - **Không được đụng vào dữ liệu kho chung:** ẩn toàn bộ nút `Tải sách`, `Chọn nhiều`, `Sửa sách`, `Xoá sách`, `Đổi tên kệ`, `Đổi ảnh bìa kệ`, `Ghim kệ yêu thích` trên UI; đồng thời chặn cứng **`403 Forbidden`** tại Cloudflare Worker ở mọi API ghi/sửa/xoá sách và kệ.
     - **Tiến độ đọc cá nhân tách biệt trên D1:** lưu vào bảng riêng `guest_reading_progress (discord_user_id, book_id, ...)` — **tuyệt đối không chạm vào bảng `reading_progress` của Admin**, nhưng khi bạn bè lấy key mới vào ngày hôm sau (cùng tài khoản Discord) vẫn đọc tiếp đúng trang hôm trước trên mọi thiết bị.
     - Tự động thoát về `AuthGate` ngay khi hết hạn 24 giờ (kèm huy hiệu nhỏ báo thời gian phiên còn lại trên `LibraryHeader`).

---

## 2. Thiết kế Dữ liệu & Biến môi trường

### 2.1. Migration D1 (`workers/r2-storage/migrations/0003_discord_guest_access.sql`)
Giữ nguyên 100% các bảng hiện có (`books`, `reading_progress`, `shelf_prefs`), chỉ bổ sung 2 bảng độc lập:

```sql
-- Tối đa 1 dòng cho mỗi tài khoản Discord (không phình bảng theo thời gian, không lưu plaintext key)
CREATE TABLE IF NOT EXISTS discord_access (
  discord_user_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  key_hash TEXT,
  key_issued_at INTEGER,
  key_expires_at INTEGER,
  active_session_id TEXT,
  session_expires_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_access_key_hash
  ON discord_access(key_hash)
  WHERE key_hash IS NOT NULL;

-- Tiến độ đọc tách riêng cho từng tài khoản Discord (cách ly vật lý khỏi reading_progress của Admin)
CREATE TABLE IF NOT EXISTS guest_reading_progress (
  discord_user_id TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL DEFAULT 0,
  chapter_title TEXT,
  total_chapters INTEGER,
  scroll_ratio REAL NOT NULL DEFAULT 0,
  scroll_top REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (discord_user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_progress_user_updated
  ON guest_reading_progress(discord_user_id, updated_at DESC);
```

### 2.2. Secret mới trên Cloudflare Worker (cấu hình qua `wrangler secret put`, tuân thủ `AGENTS.md` §6)
- `DISCORD_PUBLIC_KEY`: Public Key của Discord Application (dùng xác thực chữ ký `Ed25519` cho mọi interaction).
- `DISCORD_GUILD_ID`: ID máy chủ Discord của bạn (chỉ thành viên trong server này mới lấy được key).
- `DISCORD_BOT_TOKEN`: Bot Token (chỉ dùng để đăng ký lệnh `/setup-bell` và đăng bảng chuông sạch sẽ vào kênh).
- *(Tuỳ chọn trong `wrangler.toml` `[vars]`)* `PUBLIC_APP_URL = "https://ofu.lol"`: link gắn trong tin nhắn bot trả về.

---

## 3. Chia Phase Triển khai, Rủi ro & Cách hoàn tác

### Phase 1 — Schema D1, Phân quyền Token & Tiến độ đọc theo Vai trò trên Worker
- **File dự kiến tạo / sửa:**
  - Tạo `workers/r2-storage/migrations/0003_discord_guest_access.sql` và cập nhật `workers/r2-storage/schema.sql`.
  - Sửa `workers/r2-storage/src/auth.ts`:
    - Mở rộng `AuthContext`: `{ role: 'owner' | 'guest'; userId: string; expiresAt: number; sessionId?: string }`.
    - `authenticatePasscodeOrKey(input, env, db)`:
      1. Kiểm tra `timingSafeEqual(input, ACCESS_PASSCODE)` trước → nếu khớp cấp token `owner` (30 ngày).
      2. Nếu không khớp passcode, chuẩn hoá chuỗi key 12 ký tự (bỏ khoảng trắng/gạch nối, viết hoa), băm `SHA-256` tra trong `discord_access` → nếu tồn tại và `key_expires_at >= Date.now()` thì xoá `key_hash = NULL` (one-time use), sinh `active_session_id` mới (đóng phiên cũ của người đó), đặt `session_expires_at = now + 24h`, cấp token `guest` (24 giờ).
    - `verifyAuth(request, env, db)` trả về `AuthContext`; với `role === 'guest'` kiểm tra thêm `active_session_id` khớp trên D1 để đảm bảo phiên cũ bị đóng tức thì khi người đó đổi key mới.
    - Thêm helper `requireOwner(auth)` ném `403 Chỉ quản trị viên mới có quyền thực hiện thao tác này.`
  - Sửa `workers/r2-storage/src/booksDb.ts` & `workers/r2-storage/src/index.ts`:
    - Đặt `requireOwner(auth)` chặn toàn bộ route ghi kho chung (`PUT /api/books/:id/file`, `PUT /api/books/:id/cover`, `PATCH /api/books/:id`, `DELETE /api/books/:id`, `POST /api/books/bulk-delete`, `POST /api/books/bulk-shelf`, `POST /api/shelves/rename`, `PUT /api/shelves/cover`, `PUT /api/shelves/favorite`).
    - `GET /api/books`: trả kèm `session: { role: auth.role, expiresAt: auth.expiresAt }`; nếu `owner` đọc từ `reading_progress`, nếu `guest` đọc từ `guest_reading_progress WHERE discord_user_id = ?` (vẫn trả `shelfCovers` & `favoriteShelves` của Admin ở chế độ chỉ xem để kệ sách hiển thị đẹp đúng ý Admin).
    - `PUT / DELETE /api/progress/:bookId`: phân nhánh ghi/xoá vào `reading_progress` (`owner`) hoặc `guest_reading_progress` (`guest`); dọn kèm `guest_reading_progress` khi Admin xoá sách.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Hai request gửi cùng 1 key song song (race condition). *Giảm thiểu:* Câu lệnh `UPDATE discord_access ... WHERE discord_user_id = ? AND key_hash = ? AND key_expires_at >= ?` kiểm tra `meta.changes === 1`, chỉ đúng 1 request thành công.
  - *Rủi ro:* Chưa kịp chạy migration `0003` trên remote. *Giảm thiểu:* Tự gọi `CREATE TABLE IF NOT EXISTS` an toàn khi phát sinh truy vấn guest/discord.
- **Cách hoàn tác:** `git revert` commit Phase 1; bảng `reading_progress` và `books` của Admin hoàn toàn nguyên vẹn nên không cần khôi phục dữ liệu cũ.

### Phase 2 — Tích hợp Discord HTTP Interactions (`🔔 Nhận chìa khoá`) ngay trên Worker
- **File dự kiến tạo / sửa:**
  - Tạo `workers/r2-storage/src/discord.ts` (`<= 280` dòng):
    - `verifyDiscordRequest(request, publicKey)`: kiểm tra `X-Signature-Ed25519` + `X-Signature-Timestamp` bằng `crypto.subtle` (`Ed25519`).
    - Xử lý `PING` (`type: 1` → `{ type: 1 }`).
    - Kiểm tra cứng `interaction.guild_id === env.DISCORD_GUILD_ID` (chặn DM hoặc server lạ).
    - Xử lý Slash Command `/setup-bell` (kiểm tra quyền `ADMINISTRATOR` / `MANAGE_GUILD` của người gọi): gọi Discord REST API bằng `DISCORD_BOT_TOKEN` đăng embed cố định của **Ofu's Library** kèm nút `🔔 Nhận chìa khoá` vào kênh hiện tại, rồi báo ẩn xác nhận cho Admin.
    - Xử lý bấm nút `ring_library_bell` (`type: 3`): chống spam cooldown `15s`, sinh key 12 ký tự không nhập nhằng (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` bằng `crypto.getRandomValues`), lưu `SHA-256` vào `discord_access` (hạn 5 phút), trả tin nhắn ẩn (`flags: 64`) kèm key và hướng dẫn vào `ofu.lol`.
  - Nối route `POST /api/discord/interactions` vào `workers/r2-storage/src/index.ts` (trước lớp auth Bearer của web).
  - Tạo script tiện ích `workers/r2-storage/scripts/register-discord-commands.mjs` (0 thư viện ngoài) để đăng ký lệnh `/setup-bell` vào Guild trong 1 giây, kèm hướng dẫn từng bước tạo Discord App & gắn secret.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Chữ ký giả mạo gọi vào `/api/discord/interactions`. *Giảm thiểu:* Bắt buộc `DISCORD_PUBLIC_KEY` hợp lệ, thiếu hoặc sai chữ ký trả `401` ngay từ đầu trước khi chạm vào D1.
- **Cách hoàn tác:** `git revert` commit Phase 2 hoặc gỡ URL khỏi Discord Developer Portal.

### Phase 3 — Cập nhật Frontend: Nhận Key tại `AuthGate` & Khoá Chế độ `Guest` Chỉ Đọc 2D
- **File dự kiến tạo / sửa (mọi file `<= 500` dòng hiệu dụng):**
  - `src/types.ts`: thêm `AuthRole = 'owner' | 'guest'` và `AuthSessionInfo`.
  - Tạo `src/lib/authSession.ts`: tách gọn quản lý token + thông tin phiên (`role`, `expiresAt`, tính thời gian còn lại) để giữ `src/lib/api.ts` gọn dưới trần `500` dòng ESLint.
  - Sửa `src/lib/api.ts`:
    - Cập nhật `loginWithPasscode` nhận về `{ token, role, expiresAt }`, lưu qua `authSession.ts`.
    - `fetchLibraryState()` đồng bộ lại `session` xác thực từ Worker (chống sửa `localStorage` giả quyền `owner`); với `guest` không ghi đè tiến độ cục bộ của `owner`.
  - Sửa `src/components/AuthGate.tsx` (**giữ nguyên giao diện hiện tại**):
    - Giữ nguyên khung thẻ `Ofu's Library`, chỉ tinh chỉnh nhãn hướng dẫn để vừa thân thiện cho bạn bè dán mã key 12 ký tự từ Discord (tự `.trim()` khoảng trắng thừa), vừa dùng chung cho Admin nhập `ACCESS_PASSCODE`.
  - Sửa `src/App.tsx`, `src/components/LibraryHeader.tsx`, `src/components/Library2DView.tsx`, `src/components/LibraryCatalogView.tsx`:
    - Khi `session.role !== 'owner'`:
      - **Khoá cứng 3D:** `canUse3D = false`, chỉ render `Library2DView`, không bao giờ nạp `Library3DHost` / `three`.
      - **Khoá toàn bộ thao tác sửa/xoá/upload:** không truyền các callback quản trị (`onUploadClick`, `onEditBook`, `onRenameShelf`, `onShelfCoverChanged`, `onToggleFavoriteShelf`, `onMoveSelectedToShelf`, `onDeleteSelected`) và không mount 5 modal quản trị.
      - Trên `LibraryHeader`: ẩn nút `Tải sách`, nút `Chọn`, công tắc `2D/3D` và thanh `Dung lượng` quản trị; hiển thị huy hiệu nhỏ gọn báo thời lượng phiên còn lại (vd `Còn 23g 58p`).
      - Bộ hẹn giờ tự động đăng xuất ngay khi chạm mốc `expiresAt` (24 giờ), đóng sách đang mở và quay về `AuthGate` kèm thông báo rõ ràng.
- **Rủi ro & Giảm thiểu:**
  - *Rủi ro:* Tăng kích thước gói entry 2D vượt trần `86.04 kB gzip` (`D-013`). *Giảm thiểu:* Chỉ thêm vài chục dòng logic thuần, không cài thêm bất kỳ package nào.
- **Cách hoàn tác:** `git revert` commit Phase 3.

### Phase 4 — Kiểm thử toàn diện, Cập nhật Tài liệu & Hướng dẫn Cài đặt Bot Discord
- Viết unit/integration test kiểm tra toàn bộ luồng: cấp key 5 phút, hết hạn sau 5 phút, dùng 1 lần (dùng lần 2 bị từ chối), đổi key mới tự đóng phiên 24h cũ, chặn `403` mọi API ghi/xoá với token `guest`, cách ly tiến độ đọc `owner` vs `guest`, xác thực chữ ký `Ed25519`.
- Chạy đủ bộ kiểm định `AGENTS.md` §7 (`npm run typecheck`, `npm run lint`, `npm run build`, Worker `npx tsc --noEmit`).
- Cập nhật đầy đủ `docs/ARCHITECTURE.md` và `HANDOFF.md` trong cùng commit, kèm hướng dẫn ngắn gọn 4 bước gắn Bot Discord lên Cloudflare Worker.

---

## 4. Checklist Kiểm thử (`AGENTS.md` §7)
- [x] Key 12 ký tự vừa sinh đăng nhập thành công trong 5 phút → nhận phiên `guest` đúng hạn **24 giờ**.
- [x] Key quá **5 phút** chưa dùng → đăng nhập trả `401` báo hết hạn.
- [x] Key đã dùng 1 lần → nhập lại lần thứ 2 trả `401` ngay lập tức.
- [x] Cùng 1 tài khoản Discord lấy key mới và đăng nhập ở trình duyệt B → trình duyệt A đang mở tự mất hiệu lực (`401`) giống TMW.
- [x] Phiên `guest`: chỉ thấy giao diện **2D**, không thấy công tắc `2D/3D`, không tải bất kỳ file `three`/`.glb` nào, không thấy nút Upload / Chọn / Sửa / Xoá / Đổi tên kệ / Đổi bìa kệ / Ghim kệ.
- [x] Phiên `guest` cố tình gọi thẳng HTTP `DELETE / PATCH / PUT / POST` sách hoặc kệ vào Worker → bị chặn **`403 Forbidden`**.
- [x] Bạn bè đọc sách đến chương 7 → lưu vào `guest_reading_progress` của riêng Discord ID đó; mở lại bằng key mới ngày hôm sau vẫn giữ chương 7; tiến độ đọc của Admin (`owner`) không hề thay đổi.
- [x] Nhập `ACCESS_PASSCODE` của Admin vào cùng ô ở `AuthGate` → vào phiên `owner` 30 ngày, hiện đầy đủ công cụ quản trị và vào được Thế giới **3D Aincrad** bình thường.
- [x] `npm run typecheck`, `npm run lint`, `npm run build` (`index-*.js = 83.39 kB gzip <= 86.04 kB`, `0 B three`), Worker `npx tsc --noEmit` đều XANH 100%.

---

## 5. Hướng dẫn 4 bước gắn Bot Discord lên Production

1. **Tạo Discord App (1 phút):**
   - Vào `https://discord.com/developers/applications` → bấm **New Application** (đặt tên tuỳ thích, vd `Thủ Thư Ofu`).
   - Tab **General Information**: copy **`APPLICATION ID`** và **`PUBLIC KEY`**.
   - Tab **Bot**: bấm **Reset Token** để copy **`DISCORD_BOT_TOKEN`**.
   - Tab **Installation** (hoặc **OAuth2 → URL Generator**): chọn scope `bot` + `applications.commands` (quyền Bot: `Send Messages`, `Embed Links`), mở link mời Bot vào Server Discord của bạn và copy **`DISCORD_GUILD_ID`** (chuột phải tên Server → *Copy Server ID*).

2. **Chạy migrate D1, nạp 3 Secret & Deploy Worker:**
   ```powershell
   cd workers/r2-storage
   npx wrangler d1 migrations apply library-db --remote
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put DISCORD_GUILD_ID
   npx wrangler secret put DISCORD_BOT_TOKEN
   npx wrangler deploy
   ```

3. **Điền Interactions Endpoint URL trên Discord Developer Portal:**
   - Quay lại tab **General Information** của Discord App → mục **Interactions Endpoint URL**, dán:
     `https://<domain-worker-của-bạn>/api/discord/interactions`
   - Bấm **Save Changes** (Worker sẽ tự xác thực chữ ký `Ed25519` + trả `PONG` xanh ngay lập tức).

4. **Đăng ký lệnh & đặt bảng chuông vào kênh Discord:**
   ```powershell
   cd workers/r2-storage
   $env:DISCORD_APP_ID="<APP_ID>"; $env:DISCORD_GUILD_ID="<GUILD_ID>"; $env:DISCORD_BOT_TOKEN="<BOT_TOKEN>"; npm run discord:register
   ```
   - Vào kênh bất kỳ trong Server Discord của bạn (vd `#thư-viện`), gõ `/setup-bell` → Bot sẽ đặt tấm bảng cố định kèm nút **`🔔 Nhận chìa khoá`** giống hệt TMW!
