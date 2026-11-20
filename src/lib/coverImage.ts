export async function compressCoverBlob(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const targetWidth = 480;
    const targetHeight = 720;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo canvas xử lý ảnh bìa.');

    const srcRatio = bitmap.width / bitmap.height;
    const dstRatio = targetWidth / targetHeight;
    const srcW = srcRatio > dstRatio ? bitmap.height * dstRatio : bitmap.width;
    const srcH = srcRatio > dstRatio ? bitmap.height : bitmap.width / dstRatio;
    const srcX = (bitmap.width - srcW) / 2;
    const srcY = (bitmap.height - srcH) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) throw new Error('Không thể nén ảnh bìa.');
    return blob;
  } finally {
    bitmap.close();
  }
}
