# HANDOFF
Cập nhật: 2026-11-24 13:00 | Nhánh: feat/v3-ux-and-community-upgrades | Build: 🟢 typecheck / lint / Worker tsc xanh
Nhiệm vụ hiện tại: **Triển khai đợt nâng cấp v3 (`D-039`: `1B / 2A / 3B`)** theo kế hoạch `docs/plans/v3-ux-and-community-upgrades.md`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v3-ux-and-community-upgrades.md

## Đang làm dở
- **Đã xong Phase 1 (Kế hoạch + ADR `D-039` + Backend Worker & Migration `0016_community_v2.sql`):**
  - Đã tạo kế hoạch `docs/plans/v3-ux-and-community-upgrades.md` & ghi nhận `D-039` vào `docs/DECISIONS.md`.
  - Đã tạo `0016_community_v2.sql`, cập nhật `schema.sql`, tách gọn `communityReactionsDb.ts` & `communityRatingsDb.ts` giữ mọi tệp `<= 500` dòng.
  - Đã nâng cấp `GET /api/books` trả `shelfRatings` (`QĐ-3 = 3B`), `GET/PUT /api/reader-settings` lưu `dailyGoalMinutes` & `readingRuler` (`QĐ-2 = 2A`), `/api/community*` hỗ trợ `PATCH` sửa chính chủ, trả lời 1 cấp, gắn `chapterNumber`, toggle 5 emoji reaction + xoá dây chuyền sạch sẽ, `discordRelease.ts` gắn `/?shelf=`, `forensicWatermark.ts` giữ `rt?: string`.
- **Đang làm tiếp:** Phase 2 — Nhóm 1 (Ambient Cover Blur + màu nhấn `16×16`, Stacked Deck + nếp gáy sách, huy hiệu `★` & sắp xếp theo đánh giá, Edge Fades, pháo giấy Canvas nạp lười, View Transitions & Deep-link `?shelf=`).

## Bước tiếp theo
1. Hoàn thành Phase 2 (Nhóm 1 UI/UX & Deep-link) và kiểm tra trần entry `<= 86.04 kB` gzip.
2. Hoàn thành Phase 3 (Nhóm 2 Trình đọc Chuyên sâu, Web Audio Soundscapes & Furigana).
3. Hoàn thành Phase 4 (Nhóm 3 Command Palette `Ctrl+K`, Daily Goal & Wrapped PNG, Bình luận v2 UI).
4. Chạy kiểm thử D1 local (`wrangler dev`) + trình duyệt Desktop/Mobile + cập nhật `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Ba tệp chưa theo dõi sẵn từ trước ở thư mục gốc được giữ nguyên ngoài Git (`git add` chỉ định từng file).

## Xong gần nhất
- **PR #26 (`fix/post-wave4-core-and-mobile`, `D-038`):** đã merge vào `origin/main`.
