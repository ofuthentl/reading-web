# HANDOFF
Cập nhật: 2026-11-23 23:35 | Nhánh: feat/discord-releases-and-comments | Build: 🟢 typecheck/lint/Worker tsc/build xanh (`index-*.js = 84.70 kB` gzip <= 86.04 kB)
Nhiệm vụ hiện tại: Hoàn tất trọn vẹn **Wave 4** (`docs/plans/roadmap-v2-upgrades.md`, `D-036` & `D-037`: Phase 4.1 Bot Discord thông báo tập mới + Phase 4.2 Bình luận & Chấm điểm 1–5 sao có `||Spoiler||`), chạy migration `0014` D1 remote, deploy Worker và đẩy nhánh lên GitHub sẵn sàng mở PR Wave 4.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Không còn hạng mục code dở dang trong lộ trình Wave 1 → Wave 4.

## Bước tiếp theo
1. Mở và merge PR Wave 4 (`feat/discord-releases-and-comments` → `main`) sau khi CI xanh.
2. Cấu hình 2 secret kênh Discord mới trên Worker production bằng `wrangler secret put` khi sẵn sàng bật thông báo tự động: `DISCORD_RELEASE_CHANNEL_ID` (hoặc fallback `DISCORD_RELEASE_WEBHOOK_URL`) và `DISCORD_KEY_CHANNEL_ID`.

## Lỗi / chặn
- Không có lỗi/chặn. Lưu ý có 3 tệp chưa theo dõi sẵn từ trước ở thư mục gốc (`Gemini_Generated_Image_u8tpmdu8tpmdu8tp.png`, `IMG_4018.JPG`, `hatsune-miku_b0bf919137_VSTHEMES-ORG/`) — tuyệt đối không dùng `git add .`.

## Xong gần nhất
- **Wave 4 trọn vẹn (`feat/discord-releases-and-comments`, `D-036` & `D-037`):**
  - **Phase 4.1 (Mục 14 — Bot Discord thông báo tập mới, `D-037`):** `workers/r2-storage/src/discordRelease.ts` + `POST /api/admin/discord/announce-release` (`requireOwner`); ưu tiên Bot API (`DISCORD_BOT_TOKEN` + `DISCORD_RELEASE_CHANNEL_ID`, fallback `DISCORD_RELEASE_WEBHOOK_URL`), 1 mẫu thống nhất cho cả bộ `public` & `restricted`, `allowed_mentions: { parse: [] }` (0 ping), Embed vàng đồng `#C89B62` gom gọn dải tập (`Tập 1 – Tập 10`) + dòng `Tác giả · Thể loại` liền mạch + ảnh bìa JPEG lớn `embed.image` đọc trực tiếp từ R2 gửi `multipart/form-data` (`attachment://cover.jpg`, 0 public URL, 0 B R2) và 2 Link Buttons (`style: 5`: `🌐 Mở thư viện` & `🔔 Nhận chìa khoá`); thêm ô tick thông báo trong `UploadDropzone.tsx`.
  - **Phase 4.2 (Mục 15 — Bình luận & Chấm điểm 1–5 sao có `||Spoiler||`):** migration `0014_comments_and_ratings.sql` (`library_ratings`, `library_comments` + 2 index), `communityDb.ts` + `/api/community*` (chống spam `1` bình luận/`10s`, phân quyền xoá Owner/Guest, hợp nhất khi đổi tên kệ và chặn cứng `403` `D-030` với kệ/tập `restricted`); parser thuần React `spoilerText.ts` (0 XSS), `communityApi.ts`, `CommunityReviewsSection.tsx` nạp lười (`6.40 kB` gzip) gắn dưới `ShelfDetailView` và cuối tập trong `ReaderView` & `GuestCanvasReader` (cả cuộn dọc lẫn nút/modal `Bình luận` ở chế độ lật trang 2 cột, bảo toàn `<canvas>` `D-028`).
  - **Kiểm định & Triển khai:** Unit test + mock Discord `multipart/form-data`, live Worker API E2E (rate limit `429`, `403` `D-030`, đổi tên kệ, quyền xoá) và trình duyệt thật PC (`Owner`) + Mobile (`Guest`) xanh 100%; `index-*.js = 84.70 kB` gzip (`<= 86.04 kB`); đã chạy migration `0014` lên D1 remote, deploy Worker & push nhánh lên GitHub.
