interface GateBackdropArtProps {
  isDark: boolean;
  isEntrance: boolean;
}

/**
 * Họa tiết kiến trúc cổng vòm & la bàn ánh sao nguyên bản của Ofu's Library (0 CDN).
 * Tường vòm phải nằm sát x=313/314 (0 khoảng đệm thừa) để thẳng hàng tuyệt đối với nút góc trên-phải.
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
                'radial-gradient(ellipse 52% 56% at 76% 50%, rgba(214, 166, 98, 0.085), transparent 70%)',
                'radial-gradient(ellipse 40% 42% at 14% 78%, rgba(96, 132, 196, 0.06), transparent 68%)',
                'linear-gradient(to right, rgba(255, 255, 255, 0.028) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(255, 255, 255, 0.028) 1px, transparent 1px)',
              ].join(', ')
            : [
                'radial-gradient(ellipse 52% 56% at 76% 50%, rgba(196, 142, 78, 0.15), transparent 70%)',
                'radial-gradient(ellipse 42% 44% at 14% 80%, rgba(168, 124, 82, 0.08), transparent 68%)',
                'linear-gradient(to right, rgba(92, 74, 54, 0.055) 1px, transparent 1px)',
                'linear-gradient(to bottom, rgba(92, 74, 54, 0.055) 1px, transparent 1px)',
              ].join(', '),
          backgroundSize: '100% 100%, 100% 100%, 64px 64px, 64px 64px',
        }}
      />

      {/* Hình vẽ nét mảnh Cổng Vòm & Ổ Khoá — cạnh phải vòm (x=313/314) trùng khít md:right-14 lg:right-20 với nút Header */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-[53%] hidden aspect-[314/560] h-[74vh] max-h-[560px] -translate-y-1/2 select-none text-ink opacity-[0.14] md:right-14 md:block lg:right-20 dark:opacity-[0.15]"
      >
        <svg
          viewBox="0 0 314 560"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block h-full w-full"
        >
          {/* Trục tâm mảnh bên trong vòm (không thò ra ngoài cạnh vòm) */}
          <line x1="157" y1="20" x2="157" y2="540" stroke="currentColor" strokeWidth="0.6" opacity="0.38" />
          <line x1="21" y1="176" x2="293" y2="176" stroke="currentColor" strokeWidth="0.6" opacity="0.38" />

          {/* Vòm cổng đôi Gothic-Classical (rìa phải x = 313 sát mép 314 của SVG) */}
          <path
            d="M 1 540 L 1 176 A 156 156 0 0 1 313 176 L 313 540"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M 21 540 L 21 176 A 136 136 0 0 1 293 176 L 293 540"
            stroke="currentColor"
            strokeWidth="1"
          />
          <line x1="1" y1="540" x2="313" y2="540" stroke="currentColor" strokeWidth="1.4" />

          {/* Trạng thái đóng (/locked) hoặc mở la bàn ánh sao (/entrance) */}
          {!isEntrance ? (
            <>
              <line x1="157" y1="40" x2="157" y2="540" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="157" cy="290" r="34" stroke={accentStroke} strokeWidth="1.3" />
              <circle
                cx="157"
                cy="290"
                r="26"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeDasharray="4 3"
              />
              <rect
                x="148"
                y="286"
                width="18"
                height="15"
                rx="2"
                stroke={accentStroke}
                strokeWidth="1.3"
              />
              <path
                d="M 152 286 L 152 280 A 5 5 0 0 1 162 280 L 162 286"
                stroke={accentStroke}
                strokeWidth="1.3"
              />
            </>
          ) : (
            <>
              <circle cx="157" cy="176" r="88" stroke="currentColor" strokeWidth="0.9" />
              <circle
                cx="157"
                cy="176"
                r="72"
                stroke={accentStroke}
                strokeWidth="1.1"
                strokeDasharray="6 4"
              />
              <circle cx="157" cy="176" r="44" stroke="currentColor" strokeWidth="0.9" />

              {/* Ngôi sao 4 cánh Bắc Đẩu */}
              <path
                d="M 157 118 L 164 169 L 215 176 L 164 183 L 157 234 L 150 183 L 99 176 L 150 169 Z"
                stroke={accentStroke}
                strokeWidth="1.2"
              />

              {/* Lỗ khoá trung tâm */}
              <circle cx="157" cy="342" r="14" stroke={accentStroke} strokeWidth="1.4" />
              <path
                d="M 151 353 L 146 392 L 168 392 L 163 353"
                stroke={accentStroke}
                strokeWidth="1.4"
              />
            </>
          )}

          {/* Các tầng gáy sách tối giản phía chân cổng */}
          <line x1="35" y1="444" x2="129" y2="444" stroke="currentColor" strokeWidth="0.8" opacity="0.65" />
          <line x1="185" y1="444" x2="279" y2="444" stroke="currentColor" strokeWidth="0.8" opacity="0.65" />
          <rect x="45" y="406" width="12" height="38" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="60" y="398" width="14" height="46" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="77" y="410" width="11" height="34" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="223" y="402" width="13" height="42" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="239" y="409" width="11" height="35" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          <rect x="253" y="396" width="15" height="48" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
        </svg>
      </div>
    </>
  );
}
