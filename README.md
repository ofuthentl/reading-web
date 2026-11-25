# Arcane Library (`ofu.lol`)

Web đọc sách cá nhân (**EPUB, DOCX** — đã gỡ hoàn toàn PDF/MOBI/CBZ theo `D-009`/`D-033`) xây bằng React + Vite + TypeScript (font tiếng Việt tự lưu trữ 0 CDN, PWA app shell siêu mỏng), backend chạy trên Cloudflare Workers + D1 + R2 (giới hạn an toàn **9.0 GiB** Free Tier), hỗ trợ chia sẻ quyền chỉ đọc 24 giờ qua Discord Bot Key với 4 lớp chống cào (`D-026`/`D-028`), cache đọc tức thì qua IndexedDB và deploy GitHub Pages tại `https://ofu.lol`.

## Chạy phát triển (Local Dev)

### 1. Frontend
```bash
npm ci
cp .env.example .env.local
# Điền VITE_API_URL=http://127.0.0.1:8787 (hoặc để trống khi dev để chạy Local-First)
npm run dev
```

Kiểm tra nhanh trước khi commit:
```bash
npm run typecheck
npm run lint
npm test
VITE_BASE_PATH=/ npm run build
npm run check:bundle
```

### 2. Cloudflare Worker (Local)
```bash
cd workers/r2-storage
npm ci
npm run db:init:local
# Tạo file .dev.vars (KHÔNG commit) với:
# ACCESS_PASSCODE=your-passcode
# AUTH_SECRET=random-long-secret
npx tsc --noEmit
npm run dev
```

## Triển khai Backend (Cloudflare D1 + R2 + Worker)

```bash
cd workers/r2-storage
npm ci

# 1. Tạo R2 bucket
npx wrangler r2 bucket create arcane-library-books

# 2. Tạo D1 database, copy database_id dán vào workers/r2-storage/wrangler.toml
npx wrangler d1 create library-db

# 3. Khởi tạo schema trên D1 production
npm run db:init:remote

# 4. Cài secrets cho Worker (nhập giá trị khi được hỏi)
npx wrangler secret put ACCESS_PASSCODE
npx wrangler secret put AUTH_SECRET

# 5. Deploy Worker
npm run deploy
```

## Cấu hình Deploy Frontend (GitHub Pages)

1. Vào **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**.
2. Tạo secret `VITE_API_URL` với giá trị là URL Worker sau khi deploy (ví dụ `https://arcane-library-api.<subdomain>.workers.dev`).
3. Khi Pull Request được merge vào `main`, workflow `.github/workflows/deploy.yml` sẽ tự động chạy `typecheck` → `lint` → `test` → `build` → `check:bundle` (`index-*.js <= 86.04 kB` gzip) và deploy lên `ofu.lol`.

## Tài liệu dự án

- [AGENTS.md](AGENTS.md) — Luật làm việc bất biến cho AI/cộng tác viên.
- [HANDOFF.md](HANDOFF.md) — Tiến độ hiện tại và bước tiếp theo.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Bản đồ module, API Worker, schema D1, biến môi trường, hàm tiện ích đã có.
- [docs/DECISIONS.md](docs/DECISIONS.md) — Sổ quyết định kiến trúc đã chốt (ADR).
- [docs/PROMPTS.md](docs/PROMPTS.md) — Prompt nhanh để bàn giao khi đổi phiên / sắp hết quota.
- [docs/plans/v5-bugfixes-and-upgrades.md](docs/plans/v5-bugfixes-and-upgrades.md) — Kế hoạch Vá lỗi Toàn diện & Nâng cấp v5 (3 Wave).
