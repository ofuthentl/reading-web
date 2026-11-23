-- D-033: Gỡ bỏ hoàn toàn định dạng PDF khỏi thư viện (chỉ giữ EPUB và DOCX).
-- Lưu ý an toàn: Không dùng DROP TABLE books để tránh ON DELETE CASCADE lên các bảng con.
-- Chỉ dọn sạch dữ liệu PDF cũ nếu có; Worker API đã chặn tuyệt đối file_type = 'pdf'.

DELETE FROM reading_progress WHERE book_id IN (SELECT id FROM books WHERE file_type = 'pdf');
DELETE FROM guest_reading_progress WHERE book_id IN (SELECT id FROM books WHERE file_type = 'pdf');
DELETE FROM book_guest_packs WHERE book_id IN (SELECT id FROM books WHERE file_type = 'pdf');
DELETE FROM book_bookmarks WHERE book_id IN (SELECT id FROM books WHERE file_type = 'pdf');
DELETE FROM books WHERE file_type = 'pdf';
