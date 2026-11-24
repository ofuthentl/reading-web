# HANDOFF
Cập nhật: 2026-11-24 13:37 | Nhánh: feat/v3-ux-and-community-upgrades | Build: 🟢 typecheck / lint / build (85.12 kB gzip) / Worker tsc xanh
Nhiệm vụ hiện tại: **Triển khai đợt nâng cấp v3 (`D-039`: `1B / 2A / 3B`) + Vá lỗi kệ dài & `SS Tập X`**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v3-ux-and-community-upgrades.md

## Đang làm dở
- **Đã xong Phase 1 (Backend Worker v3 & Migration `0016_community_v2.sql`):** đã commit sạch.
- **Đã xong Bản vá cắt tên kệ dài (`> 6` từ), `SS/EX/SP Tập X` & thông báo Discord:**
  - `shelfPlacement.ts`: luôn `addCandidate(baseForSplit)` + nâng vòng lặp từ lên `24`, nhận diện đầy đủ `SS Tập X`, `SS X`, `EX/SP/Bonus/Ngoại Truyện/Side Story/Short Stories`, `Tập X SS`, `Tập X.5` (unit test Node 7/7 pass).
  - `UploadBatchShelfBar.tsx`: mở rộng nút tên kệ (`sm:max-w-[26rem]`) & ô nhập (`sm:w-72`, `flex-wrap`).
  - `discordReleaseFormat.ts` & `discordRelease.ts`: khôi phục tác giả/nhãn tập từ dữ liệu cũ, gom dải `Tập 1 – Tập N · Tập 2 SS – Tập N SS`, gộp nhãn trùng lặp và thêm nút Admin `Thông báo Discord` trên `ShelfDetailHero`.
- **Đã xong Phase 2 (Nhóm 1 — Hình ảnh, Điểm sao `★`, Hiệu ứng & Deep-link `?shelf=`):**
  - Ambient Cover Blur + trích màu nhấn `16×16` (`coverAccentColor.ts`), Stacked Deck + nếp gáy sách, huy hiệu `★` & sắp xếp `rating_desc`, Edge Fades, pháo giấy nạp lười (`confettiBurst.ts`), View Transitions và `useShelfDeepLink.ts` (`index-*.js = 85.12 kB` gzip `<= 86.04 kB`).
- **Đang làm tiếp:** Phase 3 (Nhóm 2 Trình đọc Chuyên sâu, Web Audio Soundscapes & Furigana) & Phase 4 (Nhóm 3 Command Palette `Ctrl+K`, Daily Goal & Wrapped PNG, Bình luận v2 UI).

## Bước tiếp theo
1. Làm sạch 7 tiêu đề `SS Tập X` bị lặp của bộ *Chuyện mua bạn cùng lớp mỗi tuần một lần* trên D1, deploy Worker và đăng lại thông báo Discord.
2. Hoàn thành Phase 3 (Nhóm 2) & Phase 4 (Nhóm 3).
3. Kiểm thử D1 local, trình duyệt Desktop/Mobile và cập nhật `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc ngoài Git.

## Xong gần nhất
- **PR #26 (`fix/post-wave4-core-and-mobile`, `D-038`):** đã merge vào `origin/main`.
