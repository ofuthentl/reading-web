# Prompt mẫu để bàn giao giữa các tài khoản AI

Copy nguyên khối prompt và dán vào chat.

---

## Prompt 1 — Gửi cho AI ĐANG LÀM (khi sắp hết quota, hoặc định kỳ sau mỗi bước lớn)

```
Dừng việc đang làm lại. Cập nhật file HANDOFF.md ở thư mục gốc project để một AI khác KHÔNG có lịch sử chat này vẫn làm tiếp được ngay. Yêu cầu:

1. Điền đủ 8 mục trong HANDOFF.md, giữ nguyên cấu trúc. Ghi cụ thể và kiểm chứng được, không ghi chung chung:
   - Ghi đường dẫn file, tên hàm/component, lệnh chạy/test chính xác.
   - "Đang làm dở": ghi rõ đã sửa tới đâu, phần nào chưa xong, code có đang chạy được không.
   - "Bước tiếp theo": danh sách hành động có thứ tự, mỗi bước làm được ngay.
   - "Quyết định quan trọng": ghi cả lý do và các phương án đã thử rồi bỏ, để AI sau không làm lại.
   - "Lỗi tồn tại": ghi nguyên văn thông báo lỗi, cách tái hiện và những gì đã thử.
   - "Lưu ý của người dùng": tổng hợp mọi yêu cầu, sở thích, điều cấm tôi đã nói trong cuộc chat này.
2. Viết ngắn gọn, dạng gạch đầu dòng, không kể lể quá trình.
3. Sau đó chạy: git add -A; git commit -m "WIP: handoff checkpoint", rồi điền hash commit vào đầu file.
4. Trả lời tôi ngắn gọn: đã cập nhật xong, và bước tiếp theo là gì.

Làm NGAY, ưu tiên hơn mọi việc khác, vì quota có thể hết bất cứ lúc nào.
```

---

## Prompt 2 — Gửi cho AI MỚI (sau khi đổi tài khoản)

```
Bạn đang tiếp quản một công việc dang dở từ một phiên AI khác. Trước khi viết hay sửa bất kỳ code nào:

1. Đọc kỹ HANDOFF.md ở thư mục gốc project.
2. Chạy git log -n 10 --oneline và git status để xem trạng thái hiện tại. Nếu có thay đổi chưa commit thì xem git diff.
3. Mở các file được nhắc tới trong mục "Đang làm dở" để nắm code thực tế.
4. Tóm tắt lại cho tôi trong 5–8 dòng: mục tiêu, đang ở đâu, bước tiếp theo bạn định làm. Nếu HANDOFF.md mâu thuẫn với code thực tế thì báo cho tôi.
5. Đợi tôi xác nhận rồi mới bắt đầu làm.

Khi làm:
- Tôn trọng các quyết định ở mục 6 và lưu ý ở mục 8. Không tự ý đảo ngược.
- Sau mỗi bước lớn thì cập nhật lại HANDOFF.md (đổi ngày giờ, chuyển việc sang "Đã hoàn thành", cập nhật "Bước tiếp theo").
```

---

## Prompt 3 — Gửi đầu mỗi phiên mới (tùy chọn, để AI tự cập nhật định kỳ)

```
Trong suốt phiên này, sau mỗi khi hoàn thành một bước đáng kể (một tính năng, sửa xong một lỗi, hoặc khoảng 15–20 phút làm việc), hãy tự cập nhật HANDOFF.md và commit git mà không cần tôi nhắc. Chỉ báo một dòng "đã cập nhật HANDOFF".
```
