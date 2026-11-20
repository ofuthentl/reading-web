# HANDOFF
Cập nhật: 2026-11-21 00:58 | Nhánh: refactor/code-splitting | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Refactor code-splitting — đã hoàn tất kiểm thử tự động & thủ công Mục 5C, đã push nhánh sẵn sàng mở PR vào `main`
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Nhánh `refactor/code-splitting` đã hoàn tất toàn bộ 4 phase, bản vá hậu review và vượt qua 100% Checklist kiểm thử tự động + thủ công (Mục 5A, 5B, 5C).
- Entry `index-*.js` giảm từ **918.12 kB** (gzip 277.95 kB) xuống **259.77 kB** (gzip 76.92 kB); `npm run build` **0 lỗi, 0 cảnh báo chunk > 500 kB** (còn 1 cảnh báo externalize `stream` đã biết từ `sax`).

## Bước tiếp theo
1. Mở Pull Request `refactor/code-splitting` → `main` trên GitHub, xác nhận cả 2 job CI (`Frontend` và `Worker`) đều xanh → duyệt & Merge vào `main`.
2. Theo dõi `.github/workflows/deploy.yml` deploy xong bản code-splitting lên `https://ofu.lol`.
3. Triển khai Phase 4 (Thư viện 3D `FantasyLibrary3D`) trên nhánh mới tách từ `main` sau khi merge, tuân thủ D-004 + D-008.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Xác nhận hậu kỳ Phase 3:** `https://ofu.lol` đã chạy ổn định trên PC & mobile; đã dọn sạch project Supabase cũ và secret `VITE_SUPABASE_*` theo D-001.
- **Kiểm thử thủ công Mục 5C (`refactor/code-splitting`):** đã xác nhận đăng nhập cổng 5173, Network ở `AuthGate` & preload idle ở Thư viện 2D, đọc Offline EPUB vs thông báo lỗi PDF/MOBI không reload mất tab, `PdfReaderFallback` cục bộ, đọc đủ 4 định dạng EPUB/PDF/MOBI/CBZ, upload trích bìa, `DOMPurify` chặn EPUB độc hại và tự tải lại 1 lần khi chunk cũ 404.
- **Phase 1 → 4 (`refactor/code-splitting`):** ghi **D-008**, tách `parsers.ts` (`bookMetadata`, `coverImage`, `pdfjsLoader`, `sanitizeHtml` dùng `dompurify` v3, `chunkReload`), lazy-load `PdfReader.tsx` + `PdfReaderFallback.tsx`, đồng bộ `docs/ARCHITECTURE.md`.
