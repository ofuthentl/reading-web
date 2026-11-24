# HANDOFF
Cập nhật: 2026-11-24 22:40 | Nhánh: feat/v4-spine-shelf-and-catalog | Build: 🟢 typecheck / lint / Worker tsc xanh
Nhiệm vụ hiện tại: **Triển khai nâng cấp v4 (8 hạng mục: A1, A2, C12 chỉ độ đậm chữ, C13, D15 bỏ Tạm ngưng, D16, D18, D19 Khoá Tập/Chương)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/v4-spine-shelf-and-catalog.md

## Đang làm dở
- Chuẩn bị triển khai **Phase 4 — Cộng đồng, Hệ sinh thái Kho sách & UI Quản trị (`D15`, `D16`, `D18`, `D19`)**.

## Xong trong nhánh này
1. **Phase 1 — Backend Worker, Migration `0018` & Bảo mật 3 tầng (`Bộ → Tập → Chương`):**
   - Hoàn tất migration `0018`, chấm nửa sao `0.5..5.0`, `rereadCount`, whitelist `fontWeight` + `eyeBreakMinutes`, liên kết `shelf_relations` và phân quyền 3 tầng `Bộ → Tập → Chương` (`0 B` re-pack R2).
2. **Phase 2 — Giao diện Thị giác (`A1` Tủ Gáy Sách 2D & `A2` Hiệu ứng Ánh Kim):**
   - Hoàn tất `SpineBookshelfView` (hộp cứng 90° Light Novel Nhật, hover-intent `40ms`, `ResizeObserver`, cảm ứng 2 chạm, 4 nền) & `.cover-foil-card`.
3. **Phase 3 — Trình đọc (`C12` Độ đậm chữ, `C13` Tự học WPM + Nhắc nghỉ mắt & UI Khoá chương `D19`):**
   - `types.ts`, `readerSettingsStorage.ts`, `readingEstimate.ts`, `reader.css`, `guestCanvasMetrics.ts`, `guestCanvasLayout.ts`, `guestCanvasPaint.ts`, `guestCanvasPages.ts`, `useReaderCanvasFontVersion.ts`: đồng bộ độ đậm chữ `Thường` · `Vừa` · `Đậm` trên cả DOM & `<canvas>` (cuộn dọc + lật trang).
   - `readingSpeedTracker.ts`, `useActiveReadingTimer.ts`, `useReaderController.ts`, `useReaderChapterProgress.ts`, `ReaderSettingsPopover.tsx`, `ReaderFooterStatusBar.tsx`: tự học WPM bằng EMA (`120..450 WPM` + đặt lại `220`) và thanh nhắc nghỉ mắt `30/45/60p` (tự reset khi ẩn tab `>= 2p`).
   - `ReaderTocDrawer.tsx`, `GuestLockedChapterCard.tsx`, `useGuestChapterStream.ts`, `useGuestCanvasViewport.ts`, `ReaderDomScrollStage.tsx`, `GuestCanvasReader.tsx`, `ReaderView.tsx`: hiện `🔒` trên mục lục khách, tự nhảy qua chương đầu bị khoá & màn hình khoá lịch sự chuyển tới chương mở gần nhất.

## Bước tiếp theo
1. Phase 4: UI nửa sao + Đọc lại (`D15`), gợi ý Cùng gu + Liên kết (`D16`), Xuất Markdown + Sức khoẻ kho sách (`D18`), và Modal Admin khoá Tập/Chương (`D19`).
2. Kiểm thử tích hợp Worker + D1 cục bộ, trình duyệt thật Desktop/Mobile và cập nhật `DECISIONS.md` (`D-042`) + `ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên 3 tệp/thư mục chưa theo dõi sẵn ở thư mục gốc ngoài Git.
