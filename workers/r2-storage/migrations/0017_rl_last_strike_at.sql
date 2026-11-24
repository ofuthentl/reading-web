-- Migration 0017: Lưu mốc thời gian vi phạm tốc độ gần nhất (rl_last_strike_at) trên discord_access (QĐ-1 = 1A)
-- Cho phép giảm bậc thang -1 strike mỗi 30 phút yên ổn và reset 0 sau 24 giờ yên ổn,
-- chấm dứt lỗi reset trắng rl_strikes về 0 ngay sau 1 request thành công.

ALTER TABLE discord_access ADD COLUMN rl_last_strike_at INTEGER NOT NULL DEFAULT 0;
