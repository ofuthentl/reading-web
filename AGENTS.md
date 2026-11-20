# AGENTS.md — Luật làm việc bất biến

## 1. Đầu phiên bắt buộc
Trước khi sửa bất kỳ file nào:
1. Đọc `HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`.
2. Chạy `git status` và `git branch --show-current`.
3. Nếu `HANDOFF.md` mâu thuẫn với trạng thái thực tế của repo → dừng lại báo người dùng, không tự đoán.

## 2. Quy tắc Git
- **Không bao giờ** commit, push, merge hay rebase trực tiếp lên `main` (`main` tự deploy lên production `ofu.lol`).
- Mỗi việc làm trên 1 nhánh riêng: `feat/<tên>`, `fix/<tên>`, `refactor/<tên>`, `docs/<tên>`. Nếu đang ở `main` thì tạo nhánh mới trước khi sửa.
- Commit nhỏ, mỗi commit 1 mục đích rõ ràng. Merge vào `main` qua Pull Request khi CI xanh.

## 3. Lập kế hoạch
- Việc đụng hơn ~3 file, đổi kiến trúc, hoặc đụng backend/dữ liệu → viết kế hoạch vào `docs/plans/<tên>.md`, chia từng phase nhỏ kèm rủi ro và cách hoàn tác, chờ người dùng duyệt rồi mới code.

## 4. Phản biện & Quyết định
- Với quyết định không hiển nhiên: trình bày 2–3 phương án, so sánh rủi ro / công sức / khả năng hoàn tác, khuyến nghị 1 phương án và chỉ rõ điểm yếu của nó.
- Quyết định đã chốt phải ghi vào `docs/DECISIONS.md` (kèm ngày, lý do, phương án đã loại). Không tự ý đảo ngược quyết định đã chốt.

## 5. Quy chuẩn Code
- Mỗi file tối đa **500 dòng** (ép bởi ESLint `max-lines`). Tách file theo trách nhiệm rõ ràng, không cắt cơ học.
- Logic lặp đến lần thứ 3 → tách thành hàm dùng chung.
- Trước khi viết hàm tiện ích mới, **bắt buộc** tra mục "Công cụ đã có — cấm viết lại" trong `docs/ARCHITECTURE.md`; cấm viết trùng.
- Mọi `URL.createObjectURL(...)` bắt buộc có `URL.revokeObjectURL(...)` tương ứng khi huỷ/unmount.
- Không lưu dữ liệu lớn (file sách, ảnh bìa base64...) vào `localStorage`; dùng IndexedDB qua `src/lib/cache.ts`.

## 6. Bảo mật
- Tuyệt đối không đưa secret/token/key vào biến `VITE_*` hoặc commit lên Git (kể cả `.env`, `.env.local`, `.dev.vars`, `.wrangler/`).
- Secret của Cloudflare Worker chỉ cấu hình qua `wrangler secret put`.

## 7. Định nghĩa "xong"
Một nhiệm vụ chỉ được xem là xong khi đủ cả 4 điều kiện:
1. `npm run typecheck`, `npm run lint`, `npm run build` (và `npx tsc --noEmit` trong `workers/r2-storage` nếu sửa Worker) đều sạch lỗi.
2. Đã chạy thử theo checklist kiểm thử trong file plan tương ứng.
3. Đã cập nhật `HANDOFF.md` trong cùng commit.
4. Nếu có thay đổi cấu trúc/module/API/biến môi trường → đã cập nhật `docs/ARCHITECTURE.md` trong cùng commit.

## 8. Bàn giao liên tục
- Sau **mỗi commit có ý nghĩa**, tự động cập nhật `HANDOFF.md` ngay trong cùng commit đó (nhánh, trạng thái build, đang làm dở, bước tiếp theo), không cần người dùng nhắc.
- Mục tiêu: hết quota đột ngột bất cứ lúc nào cũng chỉ mất tối đa 1 bước.
- Không ghi hash commit vào `HANDOFF.md` (đã có `git log`). Giữ `HANDOFF.md` gọn dưới 60 dòng.

## 9. Mỗi sổ một vai, không chép trùng
- `AGENTS.md`: luật làm việc bất biến.
- `docs/ARCHITECTURE.md`: bản đồ code, module, API, schema, biến môi trường, công cụ đã có.
- `docs/DECISIONS.md`: sổ quyết định kiến trúc đã chốt.
- `HANDOFF.md`: trạng thái tiến độ hiện tại (thay đổi liên tục).
- `docs/plans/`: kế hoạch triển khai theo từng giai đoạn.

## 10. Ngôn ngữ & Bảo vệ tài liệu
- Trả lời người dùng và viết tài liệu bằng **tiếng Việt**; tên biến, hàm, type và commit type (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`) dùng **tiếng Anh**.
- **Không bao giờ xoá** `AGENTS.md`, `HANDOFF.md`, hoặc thư mục `docs/`.
