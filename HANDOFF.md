# HANDOFF
Cập nhật: 2026-11-21 19:52 | Nhánh: feat/library-3d | Build: 🟢 frontend (entry 84.77 kB gzip, 0 B three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: Triển khai **PR 4A — Aincrad Reading Tower** (vừa hoàn tất **Sub-phase 4A-T4**, **PA-2 Phòng Boss kép `D-024`** và **Hoạt ảnh bay & vỗ 6 cánh GPU cho Boss Tầng 4 Stormterror** → sẵn sàng kiểm tra trực quan & sang **Sub-phase 4A-T5**)
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/phase-4-aincrad-tower.md

## Đang làm dở
- **Hoàn tất trọn Sub-phase 4A-T4 + PA-2 Phòng Boss kép (`D-024`, XANH 100%):**
  - **PA-2 Đấu trường Phòng Boss kép (`D-024`):** nén `glb/scene/battle_boss.glb` (`17.78 MB` → `public/models/boss-battlefield.glb` **`2.83 MB`**, WebP 1024 + Meshopt, 0 CDN, 0 lỗi UV/normal); Tầng 4 (`starlight_ruins` — Phong Long Stormterror) vào **Đấu trường Đảo Bay Trời Mở** (scale `4x`, mặt sàn đo raycast `[-14.8, 14.8] × [-4.8, 4.8]`, collider chắn mép đảo `blocksCamera: false` cho camera xoay 360° giữa bầu trời 2K + `WorldHorizonVista`, lá cây `alphaTest` sắc nét, Cửa Thoát lam cánh Tây); Tầng 1–3 giữ Colosseum kín 360° (`boss-arena.glb`).
  - **Sửa nền HUD/Dropdown sắc nét:** thay toàn bộ opacity ngoài thang Tailwind v3 (`/92`, `/98`, `/12`) về `bg-surface` đặc cho dropdown/search và `bg-surface/95` cho thẻ `LV/HP/MP/XP` & `WorldQuickBar`.
  - **Sub-phase 4A-T4 trọn bộ:** `MinimapWidget.tsx` tự co giãn theo `floor.bounds` (kể cả Phòng Boss Colosseum & Đảo Bay), `CozyGameHud.tsx`, `WorldQuickBar.tsx` (dropdown chịu 10–100+ tầng + tìm sách xuyên tầng), `ambientAudio.ts` (Web Audio nội bộ 0 CDN, mặc định TẮT, `close()` khi unmount), `InteractiveStations.tsx` (vòng sáng rune 3D nổi sáng trong tầm `[E]`).

## Bước tiếp theo
1. Người dùng F5 `npm run dev` kiểm tra trực quan: nền HUD/dropdown rõ nét, vào Phòng Boss Tầng 4 (`starlight_ruins`) xem Đấu trường Đảo Bay `boss-battlefield.glb` + Phong Long Stormterror + bầu trời sao 360°, Tầng 1–3 vẫn là Colosseum kín 360°.
2. **Sub-phase 4A-T5:** rà checklist mục 4 trong `docs/plans/phase-4-aincrad-tower.md` (desktop `>= 1024px`, mobile `< 1024px`, 5 modal, 0 FPS khi đọc sách/ẩn tab) → mở Pull Request `feat/library-3d` → `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Hoạt ảnh bay & vỗ 6 cánh GPU cho Boss Tầng 4 Stormterror (`feat/library-3d`):** `StormterrorBossGlb.tsx` (vertex shader `onBeforeCompile` đồng bộ 4 mesh theo không gian gốc rồng: vỗ 6 cánh lệch pha, quẫy đuôi, đảo cổ/đầu, lượn hình số 8, nghiêng cánh, quay theo Kirito & vòng gió Anemo; 0 FPS khi paused/reduced-motion).
- **PA-2 Phòng Boss kép (`feat/library-3d`, D-024):** `public/models/boss-battlefield.glb` (`2.83 MB`), `bossRoomLayout3d.ts`, `BossArenaMesh.tsx`, `WorldBiomeMesh.tsx`, `InteractiveStations.tsx`.
- **Sửa nền trong suốt HUD/Dropdown & trọn Sub-phase 4A-T4 (`feat/library-3d`):** `MinimapWidget.tsx`, `CozyGameHud.tsx`, `WorldQuickBar.tsx`, `ambientAudio.ts`, `InteractiveStations.tsx`.
