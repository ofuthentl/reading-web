export interface CompressCoverOptions {
  /** Reject tiny icons/dividers or blank single-color images (e.g. blank DOCX thumbnails) */
  rejectBlankOrTiny?: boolean;
}

const MIN_CANDIDATE_DIMENSION_PX = 80;
const MIN_CANDIDATE_ASPECT_RATIO = 0.22;
const MAX_CANDIDATE_ASPECT_RATIO = 3.2;
const COLOR_DELTA_THRESHOLD = 14;
const MIN_CONTRAST_SAMPLE_RATIO = 0.015;

function isNearlyUniformCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  const stepX = 20;
  const stepY = 20;
  const baseIdx = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  const r0 = data[baseIdx];
  const g0 = data[baseIdx + 1];
  const b0 = data[baseIdx + 2];

  let totalSamples = 0;
  let contrastingSamples = 0;

  for (let y = 10; y < height; y += stepY) {
    for (let x = 10; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      totalSamples += 1;
      if (
        Math.abs(data[idx] - r0) > COLOR_DELTA_THRESHOLD ||
        Math.abs(data[idx + 1] - g0) > COLOR_DELTA_THRESHOLD ||
        Math.abs(data[idx + 2] - b0) > COLOR_DELTA_THRESHOLD
      ) {
        contrastingSamples += 1;
      }
    }
  }

  return totalSamples > 0 && contrastingSamples / totalSamples < MIN_CONTRAST_SAMPLE_RATIO;
}

export async function compressCoverBlob(
  source: Blob,
  options?: CompressCoverOptions,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const srcRatio = bitmap.width / bitmap.height;
    if (options?.rejectBlankOrTiny) {
      if (
        bitmap.width < MIN_CANDIDATE_DIMENSION_PX ||
        bitmap.height < MIN_CANDIDATE_DIMENSION_PX
      ) {
        throw new Error('Ảnh ứng viên quá nhỏ để làm ảnh bìa.');
      }
      if (srcRatio < MIN_CANDIDATE_ASPECT_RATIO || srcRatio > MAX_CANDIDATE_ASPECT_RATIO) {
        throw new Error('Tỉ lệ ảnh ứng viên không phù hợp làm ảnh bìa.');
      }
    }

    const targetWidth = 480;
    const targetHeight = 720;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo canvas xử lý ảnh bìa.');

    const dstRatio = targetWidth / targetHeight;
    const srcW = srcRatio > dstRatio ? bitmap.height * dstRatio : bitmap.width;
    const srcH = srcRatio > dstRatio ? bitmap.height : bitmap.width / dstRatio;
    const srcX = (bitmap.width - srcW) / 2;
    const srcY = (bitmap.height - srcH) / 2;

    // Fill warm neutral paper backdrop before drawing in case of transparent PNG covers
    ctx.fillStyle = '#f6f1e7';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, targetWidth, targetHeight);

    if (options?.rejectBlankOrTiny && isNearlyUniformCanvas(ctx, targetWidth, targetHeight)) {
      throw new Error('Ảnh ứng viên trống hoặc chỉ có một màu đơn sắc.');
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) throw new Error('Không thể nén ảnh bìa.');
    return blob;
  } finally {
    bitmap.close();
  }
}
