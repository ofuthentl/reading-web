# Kế hoạch Triển khai — Cổng `/entrance` & `/locked` Phong cách Tối giản (`feat/entrance-and-locked-routes`)

> **Nhánh triển khai:** `feat/entrance-and-locked-routes` (tách từ `main` sau PR #7).
> **Quyết định kiến trúc:** **`D-027`** trong `docs/DECISIONS.md` (mở rộng `D-026`).
> **Trạng thái:** Đang chờ người dùng duyệt kế hoạch trước khi viết code (`AGENTS.md` §3).

---

## 1. Mục tiêu & Trải nghiệm

1. **Hai trang cổng tách biệt giống cơ chế TMW, mang thương hiệu `Ofu's Library`:**
   - **`/locked` (`Ofu's Library Closed.`):**
     - Mọi người chưa đăng nhập khi truy cập thẳng `https://ofu.lol/` (hoặc khi bấm **Đăng xuất**, hết hạn 24 giờ, hoặc bị đóng phiên `401` do mở khoá ở nơi khác) đều được chuyển sang `/locked`.
     - **Hoàn toàn không có ô nhập mã và không có nút/link dẫn sang `/entrance`**. Nếu vừa bị đẩy ra do hết hạn / đóng phiên thì hiển thị dòng chú thích nhỏ tinh tế bên dưới tiêu đề để người đọc biết lý do.
   - **`/entrance` (`Ofu's Library Entrance.`):**
     - Chỉ mở khi truy cập trực tiếp `https://ofu.lol/entrance` (từ link trong tin nhắn Bot Discord hoặc bookmark của Admin).
     - Thiết kế tối giản nghệ thuật: nền giấy kẻ sọc dọc mảnh + chữ chìm `書庫` bên phải, dấu triện đỏ góc trái, tiêu đề serif nghiêng lớn **`Ofu's Library Entrance.`**, khung nhập **`ACCESS CODE`** chia **12 ô** (tự thích ứng mượt nếu bạn nhập `ACCESS_PASSCODE` Admin dài hơn 12 ký tự hoặc có chữ thường/ký tự đặc biệt để không bao giờ kẹt đăng nhập Admin), nút tròn `Enter the library →`.
     - Đồng bộ trọn vẹn cả **3 chế độ màu** (`light` giấy ấm `#f6f1e7` / `dim` chiều tối / `midnight` đêm khuya) kèm nút đổi màu kín đáo góc trên-phải.
     - Nhập mã hợp lệ → chuyển thẳng về **`https://ofu.lol/`**; bên trong thư viện 2D & 3D giữ nguyên 100%.

2. **Hỗ trợ đường dẫn tĩnh `200 OK` trên GitHub Pages (0 thư viện ngoài):**
   - Không cài `react-router-dom` (`0 B` phụ thuộc mới).
   - Khi chạy `npm run build`, plugin nhỏ trong `vite.config.ts` tự tạo `dist/entrance/index.html`, `dist/locked/index.html` và `dist/404.html` từ `dist/index.html` (đồng thời sửa link icon/manifest trong `index.html` dùng đường dẫn gốc hợp lệ để mở `/entrance` không lỗi tải icon).

3. **Cập nhật link trong Bot Discord (`workers/r2-storage/src/discord.ts`):**
   - Cả bảng chuông `/setup-bell` lẫn tin nhắn ẩn trả key đều gắn thẳng link **`https://ofu.lol/entrance`** tại chữ `[cổng thư viện]`.

---

## 2. Chia Phase, Rủi ro & Cách hoàn tác

### Phase 1 — Định tuyến nhẹ `gateRoutes.ts`, Cấu hình Build GitHub Pages & Cập nhật Link Bot Discord
- **File tạo / sửa:**
  - Tạo `src/lib/gateRoutes.ts` (`<= 65` dòng): đọc/chuẩn hoá route hiện tại (`'root' | 'entrance' | 'locked'`), hàm `navigateGateRoute` dùng `history.replaceState` + sự kiện `popstate` (tương thích `import.meta.env.BASE_URL`).
  - Sửa `index.html` & `vite.config.ts`: đảm bảo tài nguyên tĩnh tải đúng từ `/entrance` & `/locked`; plugin `closeBundle` xuất sẵn `dist/entrance/index.html`, `dist/locked/index.html`, `dist/404.html`.
  - Sửa `workers/r2-storage/src/discord.ts`: trỏ link `[cổng thư viện]` về `${appUrl}/entrance`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Đang đăng nhập sẵn mà F5 ở `/` bị nháy sang `/locked`. *Giảm thiểu:* Chỉ chuyển `/` → `/locked` **sau khi** kiểm tra xong không có token hợp lệ.
  - *Hoàn tác:* `git revert` commit Phase 1.

### Phase 2 — Giao diện `AuthGate.tsx` (`Ofu's Library Entrance.` / `Ofu's Library Closed.`) & Nối `App.tsx`
- **File sửa:**
  - Sửa `src/components/AuthGate.tsx`: dựng khung nền giấy kẻ dọc + chữ chìm `書庫` + dấu triện đỏ + phân nhánh render `/entrance` (`Ofu's Library Entrance.` + khung 12 ô tương thích cả key 12 ký tự và passcode Admin bất kỳ) vs `/locked` (`Ofu's Library Closed.` không nút chuyển trang).
  - Sửa `src/App.tsx`: đồng bộ URL về `/` khi đã xác thực; đẩy về `/locked` khi đăng xuất, hết hạn 24 giờ hoặc gặp lỗi `401`.
  - Cập nhật `docs/ARCHITECTURE.md` và `HANDOFF.md`.
- **Rủi ro & Hoàn tác:**
  - *Rủi ro:* Passcode Admin có chữ thường hoặc dài `> 12` ký tự bị cắt mất nếu ép cứng 12 ô chữ hoa. *Giảm thiểu:* Ô `<input>` thật giữ nguyên chuỗi gốc không cắt `maxLength`; khi `<= 12` ký tự hiển thị đẹp trong 12 ô, khi `> 12` ký tự tự gộp thành 1 khung liền mạch để nhập passcode dài thoải mái.
  - *Hoàn tác:* `git revert` commit Phase 2.

---

## 3. Checklist Kiểm thử (`AGENTS.md` §7)
- [ ] Chưa đăng nhập mở `/` → tự chuyển URL sang `/locked`, hiện **`Ofu's Library Closed.`**, không có ô nhập mã hay link sang `/entrance`.
- [ ] Chưa đăng nhập mở `/entrance` → giữ nguyên `/entrance`, hiện **`Ofu's Library Entrance.`** + khung `ACCESS CODE` 12 ô.
- [ ] Dán key Discord 12 ký tự hoặc nhập `ACCESS_PASSCODE` Admin (ngắn hoặc dài `> 12` ký tự) tại `/entrance` → đăng nhập thành công, URL tự chuyển sạch về `/`.
- [ ] Đang đăng nhập sẵn bấm F5 tại `/` → giữ nguyên ở `/`, không bị đá nhầm sang `/locked`.
- [ ] Bấm Đăng xuất hoặc hết hạn phiên 24 giờ → URL chuyển sang `/locked` kèm thông báo lý do gọn nhẹ.
- [ ] Kiểm tra kết quả `npm run build`: có đủ `dist/entrance/index.html`, `dist/locked/index.html`, `dist/404.html`, entry `index-*.js <= 86.04 kB gzip`, `npm run typecheck`, `npm run lint`, Worker `tsc --noEmit` đều XANH.
