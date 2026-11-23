# Kế hoạch triển khai: Trang Thống kê Hệ thống `/usage` cho Admin (Chống rò rỉ thông tin)

- **Ngày lập:** 2026-11-23
- **Nhánh làm việc:** `feat/admin-usage-dashboard` (rẽ từ `fix/audit-bugs-drop-pdf-and-fonts` để khi xong gộp 1 PR lên `main` publish cả 2 cùng lúc)
- **Phương án đã chọn:** **Phương án 2** — Tổng hợp bảng D1 có sẵn + 2 bảng đếm gộp theo ngày siêu nhẹ (`usage_daily_stats` & `usage_daily_readers`), **Stealth `/usage` đẩy về `/locked` khi chưa đăng nhập**.
- **Quyết định kiến trúc dự kiến:** `D-035` (ghi vào `docs/DECISIONS.md` khi hoàn tất).

---

## 1. Kiến trúc Bảo mật chống rò rỉ thông tin (4 lớp khoá cứng)

1. **Lớp 1 — Stealth Route (ẩn hoàn toàn với người lạ & khách Discord):**
   - `vite.config.ts` xuất bản sao tĩnh `dist/usage/index.html` giống `/entrance` & `/locked` để GitHub Pages trả `200 OK` (nội dung vỏ SPA y hệt `index.html`, không chứa từ khoá `admin` hay `usage`).
   - Người **chưa đăng nhập** truy cập `https://ofu.lol/usage`: `AuthGate` thấy không có phiên `owner` hợp lệ → lập tức `replaceGateRoute('locked')` hiển thị đúng giao diện *Ofu's Library Closed* (`0` lời gọi API quản trị, không lộ trang `/usage` tồn tại).
   - **Khách Discord (`guest`)** truy cập `/usage` (gõ URL hoặc `popstate`): lập tức `replaceGateRoute('root')` đưa về Thư viện bình thường, không hiện nút `/usage`, không báo lỗi 403 lộ đường dẫn.
   - **Admin (`owner`)** đã đăng nhập (hoặc F5 trên `/usage`): giữ nguyên URL `/usage`, đổi `<title>` thành `"Ofu's Library · Usage"`, gắn `<meta name="robots" content="noindex, nofollow">` và tải dữ liệu từ Worker.
2. **Lớp 2 — Backend Defense-in-Depth (`workers/r2-storage`):**
   - `GET /api/admin/usage?days=7|30` nằm trong `tryHandleAdminRoutes` → bắt buộc đi qua `requireOwner(auth)` (xác thực chữ ký `HMAC-SHA256` + `role === 'owner'`). Thiếu token trả `401`, token `guest` trả `403`, không có thân dữ liệu.
   - Mọi phản hồi `/api/admin/usage` luôn gắn `Cache-Control: no-store, private` và `X-Robots-Tag: noindex, nofollow`.
3. **Lớp 3 — Cô lập Bundle JS (`0 B` tăng ở entry & cho khách):**
   - Toàn bộ giao diện `AdminUsageView` + biểu đồ SVG thuần nội bộ (`0` thư viện chart ngoài, `0 CDN`) tách trong `React.lazy`, chỉ `import()` khi `authenticated && session.role === 'owner' && gateRoute === 'usage'`.
4. **Lớp 4 — Lọc sạch dữ liệu nhạy cảm & không lưu dấu vết thô:**
   - Tuyệt đối **không lưu IP thật** trong bảng thống kê và **không trả** `key_hash`, `active_session_id`, `ua_hash`, `ip_hash`, `file_key` trong JSON.
   - Các hàm ghi thống kê (`usageDb.ts`) chạy an toàn qua `ctx.waitUntil(...)` + `.catch(() => undefined)`: lỗi ghi thống kê không bao giờ làm chậm hay làm lỗi thao tác đọc sách/đăng nhập.

---

## 2. Thiết kế Dữ liệu D1 (Chi phí \$0)

### Migration mới: `workers/r2-storage/migrations/0010_usage_stats.sql` (cập nhật cả `schema.sql` & `ensureUsageTables`)
- **`usage_daily_stats`** *(1 dòng/ngày theo múi giờ UTC+7 `Asia/Ho_Chi_Minh`, ~365 dòng/năm)*:
  - `day_key TEXT PRIMARY KEY` (`YYYY-MM-DD`, theo UTC+7)
  - `owner_logins INTEGER NOT NULL DEFAULT 0`
  - `guest_logins INTEGER NOT NULL DEFAULT 0`
  - `discord_keys_issued INTEGER NOT NULL DEFAULT 0`
  - `login_failures INTEGER NOT NULL DEFAULT 0`
  - `guest_chapter_reads INTEGER NOT NULL DEFAULT 0`
  - `owner_progress_updates INTEGER NOT NULL DEFAULT 0`
  - `guest_searches INTEGER NOT NULL DEFAULT 0`
  - `rate_limit_hits INTEGER NOT NULL DEFAULT 0`
  - `updated_at INTEGER NOT NULL`
- **`usage_daily_readers`** *(đếm độc giả hoạt động duy nhất mỗi ngày — DAU, tự dọn quá 90 ngày)*:
  - `day_key TEXT NOT NULL`
  - `reader_scope TEXT NOT NULL` (`'owner'` hoặc `'guest:<discord_user_id>'`)
  - `role TEXT NOT NULL` (`'owner'` | `'guest'`)
  - `last_seen_at INTEGER NOT NULL`
  - `PRIMARY KEY (day_key, reader_scope)`
  - Index: `idx_usage_daily_readers_day` trên `(day_key)`.

### Điểm móc ghi sự kiện (nhẹ, không chặn luồng chính)
1. `POST /api/discord/interactions` (khi phát chìa khoá thành công): `discord_keys_issued += 1`.
2. `POST /api/auth/login`:
   - Thành công `owner`: `owner_logins += 1` + đánh dấu `usage_daily_readers('owner')`.
   - Thành công `guest`: `guest_logins += 1` + đánh dấu `usage_daily_readers('guest:<id>')`.
   - Thất bại (`401`): `login_failures += 1`; bị chặn `429` brute-force: `rate_limit_hits += 1`.
3. `GET /api/guest/books/:id/chapters/:index`:
   - Thành công: `guest_chapter_reads += 1` + đánh dấu `usage_daily_readers('guest:<id>')`.
   - Bị `429` Token Bucket: `rate_limit_hits += 1`.
4. `GET /api/guest/books/:id/search`:
   - Thành công: `guest_searches += 1` + đánh dấu `usage_daily_readers('guest:<id>')`.
   - Bị `429`: `rate_limit_hits += 1`.
5. `PUT /api/progress/:bookId`:
   - `owner`: `owner_progress_updates += 1` + đánh dấu `usage_daily_readers('owner')`.
   - `guest`: đánh dấu `usage_daily_readers('guest:<id>')` *(không cộng trùng lượt đọc chương với `guest_chapter_reads`)*.

---

## 3. Nội dung hiển thị trên `/usage` (chỉ Admin thấy)

Endpoint `GET /api/admin/usage?days=7|30` (mặc định `14`, hỗ trợ chuyển nhanh `7 ngày` / `14 ngày` / `30 ngày`):
1. **Thẻ KPI tổng quan (6 thẻ gọn):**
   - **Đang hoạt động (24h):** số phiên `guest` còn hạn / tổng thành viên Discord từng lấy key (+ số tài khoản bị khoá).
   - **Độc giả hoạt động (7 ngày / 30 ngày):** DAU không trùng & tổng lượt mở chương `guest`.
   - **Kho sách & Gói bảo mật:** tổng cuốn / tổng kệ, số cuốn đã có `guest-pack` / tổng cuốn, số kệ đang bật `restricted`.
   - **Dung lượng R2:** đã dùng / 9.0 GiB (tách rõ **File sách** · **Ảnh bìa** · **Gói bảo mật `guest-packs`**).
   - **An toàn & Chống lạm dụng:** số lần login sai, số lần chạm `429`, số IP đang bị khoá tạm (`auth_rate_limits`), tổng cảnh báo `rl_strikes`.
   - **Mức độ gắn kết:** tổng tập đã đọc xong (Owner + Guest) & tổng dấu trang (`book_bookmarks`).
2. **Biểu đồ xu hướng theo ngày (SVG nội bộ, 0 CDN, tự đồng bộ 4 chế độ nền):**
   - Chuyển đổi bộ lọc `7 ngày` · `14 ngày` · `30 ngày`.
   - Biểu đồ cột/đường tương tác hover tooltip: **Lượt đọc chương & tiến độ**, **Độc giả hoạt động mỗi ngày (DAU)** và **Chìa khoá / Đăng nhập / Cảnh báo `429`**.
3. **Top bộ truyện & tập được đọc nhiều nhất (7 ngày / 30 ngày / Mọi thời điểm):**
   - Số người đọc, số lượt hoàn thành, tiến độ trung bình, lần đọc gần nhất.
4. **Bảng Hoạt động Thành viên Discord (có lọc nhanh & chỉ hiện dữ liệu an toàn):**
   - Tên hiển thị + `#4 số cuối`, trạng thái phiên (`Đang mở` / `Hết hạn` / `Đã khoá`), số cuốn đang đọc & đã xong, cuốn + chương đọc gần nhất, số dấu trang, cảnh báo `rl_strikes`.
   - Nút dẫn nhanh quay về Thư viện (`← Về Thư viện`) và nút làm mới dữ liệu tức thì (không tự auto-poll tốn lượt D1).

---

## 4. Lộ trình triển khai từng Phase

### Phase 1 — Backend D1 Migration, Usage Recorder & Admin API
- **Tệp thêm/sửa:**
  - `workers/r2-storage/migrations/0010_usage_stats.sql` *(mới)*
  - `workers/r2-storage/schema.sql` *(cập nhật 2 bảng mới + index)*
  - `workers/r2-storage/src/usageDb.ts` *(mới, `<= 500` dòng)*: `ensureUsageTables`, `recordUsageMetric`, `recordDailyReader`, `getAdminUsageReport(env, days)` (tính theo múi giờ UTC+7, tự prune `usage_daily_readers` > 90 ngày theo xác suất nhẹ).
  - `workers/r2-storage/src/adminRoutes.ts`: thêm route `GET /api/admin/usage` (bắt buộc `requireOwner`, header `Cache-Control: no-store, private` + `X-Robots-Tag: noindex, nofollow`).
  - `workers/r2-storage/src/index.ts` & `workers/r2-storage/src/discord.ts`: truyền `ctx: ExecutionContext` và gắn `ctx.waitUntil(recordUsageMetric(...))` tại các điểm sự kiện (không ảnh hưởng độ trễ API).
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Lỗi câu SQL ghi thống kê làm lỗi API đọc sách → khắc phục bằng `ctx.waitUntil` bọc `.catch(() => undefined)` và `ensureUsageTables` cache bằng `WeakSet<D1Database>`.
  - *Hoàn tác:* `git revert <commit-phase-1>` và drop 2 bảng `usage_daily_stats`, `usage_daily_readers` (không đụng dữ liệu sách).

### Phase 2 — Stealth Routing `/usage` & Client API
- **Tệp thêm/sửa:**
  - `vite.config.ts`: thêm `'usage'` vào `staticGateRoutesPlugin` (`dist/usage/index.html`).
  - `src/lib/gateRoutes.ts`: mở rộng `GateRoute = 'root' | 'entrance' | 'locked' | 'usage'`, đồng bộ `syncGateDocumentTitle` (khi chưa auth luôn trả `"Ofu's Library Closed"` cho `'usage'`, chỉ hiện `"Ofu's Library · Usage"` khi `authenticated && owner`).
  - `src/components/AuthGate.tsx`: xử lý stealth cho `currentRoute === 'usage'` (chỉ giữ `/usage` khi có phiên `owner` đang hoạt động; khách `guest` đẩy về `'root'`; chưa đăng nhập/hết hạn đẩy ngay về `'locked'`).
  - `src/lib/usageApi.ts` *(mới)*: type `AdminUsageReport` & hàm `fetchAdminUsageReport(days)` (có fallback tổng hợp cục bộ khi chạy Local Dev không có Worker).
  - `src/App.tsx`: theo dõi `gateRoute`, gắn `<LazyAdminUsageView>` khi `authenticated && session.role === 'owner' && gateRoute === 'usage'`; chặn `guest` lạc vào `/usage` đẩy ngay về `'root'`.
  - `src/components/LibraryHeader.tsx` & `src/components/Library2DView.tsx`: thêm 1 nút biểu tượng nhỏ `Usage` (`Activity`) **chỉ hiển thị cho `isOwner` ở Cloud/Local** để Admin mở nhanh `/usage` (khách không thấy).
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* F5 trên `/usage` bị đá về `/` hoặc nháy màn hình `/locked` → kiểm tra kỹ thứ tự `verifyServer()` trong `AuthGate.tsx` và nhánh `authenticated` trong `App.tsx`.
  - *Hoàn tác:* `git revert <commit-phase-2>`.

### Phase 3 — Giao diện `/usage` (`AdminUsageView` + Biểu đồ SVG 0 CDN)
- **Tệp thêm/sửa:**
  - `src/components/AdminUsageCharts.tsx` *(mới, `<= 500` dòng)*: biểu đồ cột/đường SVG thuần responsive 0 CDN cho DAU, lượt đọc chương, đăng nhập/key & thanh phân bổ dung lượng R2 (đồng bộ đủ 4 chế độ nền `Ban ngày`/`Giữa trưa`/`Chiều tối`/`Đêm khuya`).
  - `src/components/AdminUsageView.tsx` *(mới, `<= 500` dòng)*: bố cục dashboard gọn thoáng (Header có `← Về Thư viện`, chuyển 4 nền, chọn `7/14/30 ngày`, nút Làm mới, Đăng xuất; 6 thẻ KPI; khu biểu đồ; Top sách/bộ; bảng thành viên Discord có tìm kiếm & badge trạng thái; tự gắn `<meta name="robots" content="noindex, nofollow">` khi mount).
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Tăng kích thước bundle chính → cô lập 100% trong `React.lazy`, giữ entry `index-*.js <= 86.04 kB` gzip.
  - *Hoàn tác:* `git revert <commit-phase-3>`.

### Phase 4 — Kiểm định Bảo mật, Runtime & Đồng bộ Tài liệu
- Cập nhật `docs/DECISIONS.md` (`D-035`), `docs/ARCHITECTURE.md` và `HANDOFF.md`.
- Kiểm định đầy đủ theo checklist bên dưới.

---

## 5. Checklist kiểm thử bắt buộc (`AGENTS.md` §7)

1. **Kiểm định tĩnh:**
   - `npm run typecheck`, `npm run lint` (`0/0`, mọi file `<= 500` dòng), `npm run build` (`index-*.js <= 86.04 kB` gzip, có `dist/usage/index.html`, `0` CDN), `workers/r2-storage && npx tsc --noEmit`.
2. **Kiểm định Bảo mật & Backend (`wrangler dev --local`):**
   - `GET /api/admin/usage` không token → **`401`**; token `guest` → **`403`** (0 dữ liệu rò rỉ).
   - `GET /api/admin/usage?days=7` với token `owner` → **`200`**, có header `Cache-Control: no-store, private` & `X-Robots-Tag: noindex, nofollow`, không chứa `key_hash`/`ua_hash`/`active_session_id`/`ip_hash`/`file_key`.
   - Thực hiện đăng nhập `owner` + `guest`, đọc 3 chương `guest`, 1 lần login sai → kiểm tra `usage_daily_stats` & `usage_daily_readers` tăng khớp từng số đếm và trả về đúng trong `dailySeries`.
   - Chạy migration `0010_usage_stats.sql` sạch 0 lỗi trên local D1.
3. **Kiểm định Giao diện Trình duyệt (PC `1280×800` + Mobile `390×844`):**
   - **Người lạ (chưa đăng nhập)** mở `http://127.0.0.1:5173/usage` → lập tức chuyển thành `/locked` (*Ofu's Library Closed*), `0` request tới `/api/admin/usage`, `0` tải chunk `AdminUsageView`.
   - **Khách Discord (`guest`)** đăng nhập xong thử vào `/usage` → tự đẩy về `/`, không thấy nút `Usage` trên Header, `0` request `/api/admin/usage`, `0` tải chunk `AdminUsageView`.
   - **Admin (`owner`)** đăng nhập từ `/entrance`, bấm nút `Usage` hoặc mở thẳng `/usage` + F5 tại `/usage` → hiển thị trọn vẹn KPI, biểu đồ SVG 7/14/30 ngày, Top sách, bảng hoạt động thành viên Discord trên cả 4 chế độ nền (`Ban ngày`/`Giữa trưa`/`Chiều tối`/`Đêm khuya`), mobile không tràn ngang, `0` console error, `0` CDN ngoài.
