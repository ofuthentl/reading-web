-- Mở rộng shelf_prefs lưu danh sách thể loại (tag) cho từng bộ truyện (D-032)
ALTER TABLE shelf_prefs ADD COLUMN tags_json TEXT;
