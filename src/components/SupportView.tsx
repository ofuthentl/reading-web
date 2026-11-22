import { useState } from 'react';
import { Check, Copy, Download, Heart } from 'lucide-react';
import { handleCoverTiltLeave, handleCoverTiltMove } from '@/hooks/useCardReveal';
import type { ToastType } from '@/hooks/useToast';

const SUPPORT_INFO = {
  bankName: 'TPBank (Ngân hàng TMCP Tiên Phong)',
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
    <section aria-label="Ủng hộ dự án" className="fade-in mx-auto max-w-3xl py-2 sm:py-4">
      <div className="space-y-4 border-b border-line-strong/70 pb-6">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-crimson-accent">
            ĐỒNG HÀNH &amp; DUY TRÌ
          </p>
          <h2 className="font-display text-[1.85rem] font-normal leading-[1.1] tracking-[-0.015em] text-ink sm:text-[2.3rem]">
            <span>Ủng hộ </span>
            <span className="italic text-crimson-accent">dự án</span>
          </h2>
        </div>

        <div className="space-y-3.5 pt-1 text-[15px] leading-relaxed text-ink/90 sm:text-base">
          <p>
            <strong className="font-semibold text-ink">Ofu&apos;s Library</strong> là một dự án thư
            viện cá nhân được xây dựng và duy trì bằng tâm huyết của người thực hiện.
          </p>
          <p className="text-ink-muted">
            Toàn bộ không gian đọc và tài liệu trên website đều được chia sẻ miễn phí, không quảng
            cáo, và mình mong muốn sẽ tiếp tục duy trì điều đó lâu dài trong tương lai.
          </p>
          <p className="text-ink-muted">
            Nếu bạn cảm thấy dự án mang lại giá trị và muốn góp một phần nhỏ để ủng hộ chi phí vận
            hành, lưu trữ cũng như phát triển tính năng mới, bạn có thể gửi sự ủng hộ qua mã QR bên
            dưới.
          </p>
          <p className="text-ink-muted">
            Mỗi sự đóng góp, dù lớn hay nhỏ, đều là nguồn động viên quý giá để{' '}
            <span className="font-medium text-ink">Ofu&apos;s Library</span> tiếp tục được duy trì
            và hoàn thiện hơn mỗi ngày.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center">
        <div
          onPointerMove={(e) => handleCoverTiltMove(e, 6, 5)}
          onPointerLeave={handleCoverTiltLeave}
          onPointerCancel={handleCoverTiltLeave}
          className="tilt-card w-full max-w-[320px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_20px_48px_-16px_rgba(43,36,29,0.28)] dark:border-white/15 dark:shadow-[0_24px_56px_-16px_rgba(0,0,0,0.85)] sm:max-w-[348px]"
        >
          <img
            src={SUPPORT_INFO.qrPath}
            alt={`Mã VietQR ủng hộ ${SUPPORT_INFO.accountHolder} - ${SUPPORT_INFO.bankName}`}
            className="block h-auto w-full select-none"
          />
        </div>

        <div className="moonlit-card mt-5 flex w-full max-w-[356px] flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-center shadow-sm dark:border-line-strong/60">
          <div className="space-y-0.5 text-xs text-ink-muted">
            <p className="font-semibold tracking-wide text-ink">{SUPPORT_INFO.accountHolder}</p>
            <p>
              STK:{' '}
              <span className="font-mono font-semibold text-ink">
                {SUPPORT_INFO.accountNumber}
              </span>
            </p>
            <p>{SUPPORT_INFO.bankName}</p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleCopyAccount}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Đã sao chép STK</span>
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
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
              title="Tải ảnh mã QR về điện thoại để quét trong ứng dụng ngân hàng"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Tải QR</span>
            </a>
          </div>
        </div>

        <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-ink-faint">
          <Heart className="h-3.5 w-3.5 fill-current text-crimson-accent" />
          <span>Cảm ơn bạn đã ghé thăm và đồng hành cùng thư viện!</span>
        </p>
      </div>
    </section>
  );
}
