import { useState } from 'react';
import { Check, Copy, Download, Heart } from 'lucide-react';
import { handleCoverTiltLeave, handleCoverTiltMove } from '@/hooks/useCardReveal';
import type { ToastType } from '@/hooks/useToast';

const SUPPORT_INFO = {
  bankName: 'TPBank · Ngân hàng TMCP Tiên Phong',
  accountNumber: '12092008688',
  accountHolder: 'NGUYEN TUAN LOC',
  qrPath: `${import.meta.env.BASE_URL}support-qr.png`,
} as const;

export interface SupportViewProps {
  onNotify?: (message: string, type?: ToastType) => void;
}

export function SupportView({ onNotify }: SupportViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_INFO.accountNumber);
      setCopied(true);
      onNotify?.(`Đã sao chép STK ${SUPPORT_INFO.accountNumber}`, 'success');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      onNotify?.('Không thể tự động sao chép, vui lòng chép thủ công số tài khoản.', 'info');
    }
  };

  return (
    <section
      aria-label="Ủng hộ dự án"
      className="fade-in mx-auto max-w-5xl py-4 sm:py-8 lg:py-10"
    >
      <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[minmax(0,1.18fr)_1px_minmax(0,0.88fr)] md:gap-10 lg:gap-14">
        {/* Cột trái: Nội dung chia sẻ & thông tin chuyển khoản nhanh */}
        <div className="flex flex-col justify-center space-y-6">
          <div className="space-y-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-crimson-accent">
              ĐỒNG HÀNH &amp; DUY TRÌ
            </p>
            <h2 className="font-display text-[2rem] font-normal leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.5rem]">
              <span>Ủng hộ </span>
              <span className="italic text-crimson-accent">dự án</span>
            </h2>
            <span
              aria-hidden="true"
              className="block h-[2px] w-10 rounded-full bg-[#B22222]"
            />
          </div>

          <div className="space-y-3.5 text-[15px] leading-relaxed text-ink-muted sm:text-[15.5px]">
            <p className="text-ink/95">
              <strong className="font-semibold text-ink">Ofu&apos;s Library</strong> là một dự án
              thư viện cá nhân được xây dựng và duy trì bằng tâm huyết của người thực hiện.
            </p>
            <p>
              Toàn bộ không gian đọc và tài liệu trên website đều được chia sẻ miễn phí, không quảng
              cáo, và mình mong muốn sẽ tiếp tục duy trì điều đó lâu dài trong tương lai.
            </p>
            <p>
              Nếu bạn cảm thấy dự án mang lại giá trị và muốn góp một phần nhỏ để ủng hộ chi phí vận
              hành, lưu trữ cũng như phát triển tính năng mới, bạn có thể quét mã QR bên cạnh.
            </p>
            <p>
              Mỗi sự đóng góp, dù lớn hay nhỏ, đều là nguồn động viên quý giá để{' '}
              <span className="font-medium text-ink">Ofu&apos;s Library</span> tiếp tục được duy trì
              và hoàn thiện hơn mỗi ngày.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm dark:border-line-strong/60">
            <div className="min-w-0 space-y-0.5 text-xs">
              <p className="font-semibold tracking-wide text-ink">
                {SUPPORT_INFO.accountHolder}{' '}
                <span className="font-normal text-ink-faint">·</span>{' '}
                <span className="font-mono text-crimson-accent">
                  {SUPPORT_INFO.accountNumber}
                </span>
              </p>
              <p className="truncate text-ink-muted">{SUPPORT_INFO.bankName}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAccount}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Đã chép STK</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-accent" />
                    <span>Sao chép STK</span>
                  </>
                )}
              </button>

              <a
                href={SUPPORT_INFO.qrPath}
                download="ofu-library-vietqr.png"
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
                title="Tải ảnh mã QR về máy"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Tải QR</span>
              </a>
            </div>
          </div>

          <p className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
            <Heart className="h-3.5 w-3.5 shrink-0 fill-current text-crimson-accent" />
            <span>Cảm ơn bạn đã ghé thăm và đồng hành cùng thư viện!</span>
          </p>
        </div>

        {/* Đường chia dọc ở giữa trên màn hình vừa/rộng (chuyển thành vạch ngang trên điện thoại) */}
        <div
          aria-hidden="true"
          className="h-px w-full bg-line-strong/75 md:h-full md:min-h-[420px] md:w-px"
        />

        {/* Cột phải: Thẻ mã VietQR sắc nét đứng độc lập */}
        <div className="flex items-center justify-center">
          <div
            onPointerMove={(e) => handleCoverTiltMove(e, 7, 6)}
            onPointerLeave={handleCoverTiltLeave}
            onPointerCancel={handleCoverTiltLeave}
            className="tilt-card w-full max-w-[310px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_22px_50px_-16px_rgba(43,36,29,0.3)] dark:shadow-[0_26px_60px_-16px_rgba(0,0,0,0.88)] lg:max-w-[344px]"
          >
            <img
              src={SUPPORT_INFO.qrPath}
              alt={`Mã VietQR ủng hộ ${SUPPORT_INFO.accountHolder} - ${SUPPORT_INFO.bankName}`}
              className="block h-auto w-full select-none"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
