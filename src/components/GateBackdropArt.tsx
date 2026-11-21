interface GateBackdropArtProps {
  isDark: boolean;
  isEntrance: boolean;
}

/**
 * Họa tiết kiến trúc cổng vòm & la bàn ánh sao nguyên bản của Ofu's Library (0 CDN).
 * Tạo chiều sâu không gian mở mà không dùng khung hộp SaaS hay sao chép chữ Hán của bên khác.
 */
export function GateBackdropArt({ isDark, isEntrance }: GateBackdropArtProps) {
  const accentStroke = isEntrance
    ? isDark
      ? '#e4b97a'
      : '#9a6836'
    : isDark
      ? '#8b96a8'
      : '#8a7c6b';

  return (
    <>
      {/* Lưới bản vẽ kiến trúc mảnh + quầng sáng ấm dịu */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: isDark
            ? [
                'radial-gradient(ellipse 52% 56% at 72% 48%, rgba(214, 166, 98, 0.085), transparent 70%)',
                'radial-gradient(ellipse 40% 42% at 18% 78%, rgba(96, 132, 196, 0.06), transparent 68%)',
                'linear-gradient(to right, rgba(255, 255, 255, 0.028) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(255, 255, 255, 0.028) 1px, transparent 1px)',
              ].join(', ')
            : [
                'radial-gradient(ellipse 52% 56% at 72% 48%, rgba(196, 142, 78, 0.15), transparent 70%)',
                'radial-gradient(ellipse 42% 44% at 16% 80%, rgba(168, 124, 82, 0.08), transparent 68%)',
                'linear-gradient(to right, rgba(92, 74, 54, 0.055) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(92, 74, 54, 0.055) 1px, transparent 1px)',
              ].join(', '),
          backgroundSize: '100% 100%, 100% 100%, 64px 64px, 64px 64px',
        }}
      />

      {/* Hình vẽ nét mảnh Cổng Vòm Thư Viện & Ổ Khoá Ánh Sao bên phải */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-[-2rem] top-1/2 hidden -translate-y-1/2 select-none text-ink opacity-[0.13] md:block lg:right-6 dark:opacity-[0.14]"
      >
        <svg
          width="440"
          height="620"
          viewBox="0 0 440 620"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-[78vh] max-h-[640px] w-auto"
        >
          {/* Khung đo kiến trúc ngoài */}
          <rect
            x="24"
            y="20"
            width="392"
            height="580"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray="3 5"
            opacity="0.55"
          />
          <line x1="220" y1="8" x2="220" y2="612" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
          <line x1="12" y1="230" x2="428" y2="230" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />

          {/* Vòm cổng đôi Gothic-Classical */}
          <path
            d="M 64 580 L 64 230 A 156 156 0 0 1 376 230 L 376 580"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M 84 580 L 84 230 A 136 136 0 0 1 356 230 L 356 580"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line x1="44" y1="580" x2="396" y2="580" stroke="currentColor" strokeWidth="1.4" />

          {/* Đường chia hai cánh cổng khi đóng (/locked) hoặc hé mở (/entrance) */}
          {!isEntrance ? (
            <>
              <line x1="220" y1="94" x2="220" y2="580" stroke="currentColor" strokeWidth="1.2" />
              {/* Vòng niêm phong khoá cổng */}
              <circle cx="220" cy="340" r="34" stroke={accentStroke} strokeWidth="1.3" />
              <circle
                cx="220"
                cy="340"
                r="26"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <rect
                x="211"
                y="336"
                width="18"
                height="15"
                rx="2"
                stroke={accentStroke}
                strokeWidth="1.3"
              />
              <path
                d="M 215 336 L 215 330 A 5 5 0 0 1 225 330 L 225 336"
                stroke={accentStroke}
                strokeWidth="1.3"
              />
            </>
          ) : (
            <>
              {/* Vòng la bàn astrolabe & lỗ khoá toả sáng khi ở /entrance */}
              <circle cx="220" cy="230" r="88" stroke="currentColor" strokeWidth="0.9" />
              <circle
                cx="220"
                cy="230"
                r="72"
                stroke={accentStroke}
                strokeWidth="1.1"
                strokeDasharray="6 4"
              />
              <circle cx="220" cy="230" r="44" stroke="currentColor" strokeWidth="0.9" />

              {/* Ngôi sao 4 cánh Bắc Đẩu */}
              <path
                d="M 220 172 L 227 223 L 278 230 L 227 237 L 220 288 L 213 237 L 162 230 L 213 223 Z"
                stroke={accentStroke}
                strokeWidth="1.2"
              />

              {/* Lỗ khoá trung tâm phía dưới la bàn */}
              <circle cx="220" cy="392" r="14" stroke={accentStroke} strokeWidth="1.4" />
              <path
                d="M 214 403 L 209 442 L 231 442 L 226 403"
                stroke={accentStroke}
                strokeWidth="1.4"
              />
            </>
          )}

          {/* Các tầng gáy sách tối giản phía chân cổng */}
          <line x1="98" y1="490" x2="192" y2="490" stroke="currentColor" strokeWidth="0.8" opacity="0.65" />
          <line x1="248" y1="490" x2="342" y2="490" stroke="currentColor" strokeWidth="0.8" opacity="0.65" />
          <rect x="108" y="452" width="12" height="38" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="123" y="444" width="14" height="46" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="140" y="456" width="11" height="34" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="286" y="448" width="13" height="42" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="302" y="455" width="11" height="35" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="316" y="442" width="15" height="48" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
        </svg>
      </div>
    </>
  );
}
