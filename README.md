# reading-web

## Cấu hình môi trường

Tạo file `.env.local` (hoặc `.env`) dựa trên `.env.example` và điền URL Supabase và anon key của dự án:

```bash
cp .env.example .env.local
```

Nếu bạn cần file mẫu nhanh, ở repo này đã có `.env.local` mặc định để điền giá trị thật:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Các biến bắt buộc:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Lấy URL và anon key từ Supabase
1. Mở Supabase Dashboard.
2. Chọn project của bạn.
3. Vào Project settings > API.
4. Copy:
   - `Project URL` => `VITE_SUPABASE_URL`
   - `anon public` key => `VITE_SUPABASE_ANON_KEY`
5. Dán vào `.env.local`.

### Cấu hình Auth URL cho web
1. Vào Authentication > URL Configuration.
2. Thiết lập:
   - Site URL: `https://ofu.lol` (production; domain lấy từ `public/CNAME`)
   - Additional Redirect URLs:
     - `https://ofu.lol/**`
     - `http://localhost:5173/**` (development)
3. Luồng đăng ký gửi email xác nhận trở lại origin hiện tại, nên local sẽ quay về localhost và production sẽ quay về `https://ofu.lol`. Hãy giữ cả hai URL trong danh sách cho phép.

Không dùng fallback giả như `https://...supabase.co` hoặc `******` vì nó khiến ứng dụng cố kết nối tới tài nguyên sai và khó debug.

## Chuyển file sách mới sang Cloudflare R2

Supabase tiếp tục quản lý đăng nhập, database và metadata. File tải lên mới (bao gồm ảnh bìa) được lưu trong R2; file cũ trong Supabase Storage vẫn đọc được và không cần di chuyển trước.

### 1. Tạo bucket và quyền truy cập R2
1. Tạo một private R2 bucket trong Cloudflare Dashboard.
2. Tạo S3 API token chỉ có quyền đọc/ghi object trong bucket đó. Không dùng token này trong frontend.
3. Trong R2 bucket > Settings > CORS policy, thêm policy cho domain production và local dev:

```json
[
  {
    "AllowedOrigins": ["https://ofu.lol", "http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

### 2. Cài migration và deploy Worker
Áp dụng migration `supabase/migrations/20261109000000_add_r2_book_file_access.sql` cho Supabase trước khi dùng file R2. Sau đó cấu hình và deploy Worker:

```powershell
cd workers\r2-storage
npm install
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_BUCKET_NAME
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npm run deploy
```

Mỗi lệnh `wrangler secret put` sẽ hỏi giá trị tương ứng. `APP_ORIGINS` trong `wrangler.toml` cần khớp chính xác với domain website; thêm các origin staging nếu có. Worker chỉ trả URL ký tạm thời sau khi xác thực phiên Supabase và kiểm tra quyền đọc tệp trong database.

### 3. Cấu hình frontend
Đặt `VITE_R2_STORAGE_API_URL` trong `.env.local` và biến môi trường production thành URL Worker sau khi deploy (ví dụ `https://reading-web-r2-storage.<subdomain>.workers.dev`). Không thêm S3 access key hoặc secret key vào biến `VITE_*`.

File tải lên mới tối đa 400 MB. File hiện có tiếp tục dùng Supabase Storage cho đến khi được chuyển riêng; tránh xóa bucket Supabase khi còn file cũ.
