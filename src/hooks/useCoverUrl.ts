import { useEffect, useState } from 'react';
import { fetchCoverBlobCached } from '@/lib/api';

/**
 * Loads a book cover Blob via IndexedDB cache / Cloudflare R2 and manages
 * the Object URL lifecycle with strict URL.revokeObjectURL cleanup.
 */
export function useCoverUrl(coverKey: string | null, enabled = true): string | null {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!coverKey || !enabled) {
      setCoverUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setCoverUrl(null);

    fetchCoverBlobCached(coverKey)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setCoverUrl(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setCoverUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setCoverUrl(null);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };
  }, [coverKey, enabled]);

  return coverUrl;
}
