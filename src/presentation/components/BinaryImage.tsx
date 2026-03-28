import { useEffect, useMemo } from 'react';
import { createObjectUrl } from '../../infrastructure/services/imageService';

interface BinaryImageProps {
  bytes: Uint8Array | null;
  mime: string | null;
  alt: string;
  className?: string;
}

export function BinaryImage({ bytes, mime, alt, className }: BinaryImageProps) {
  const url = useMemo(() => createObjectUrl(bytes, mime), [bytes, mime]);

  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);

  if (!url) {
    return <div className={`${className ?? ''} binary-image-placeholder`}>{alt.slice(0, 1)}</div>;
  }

  return <img className={className} src={url} alt={alt} />;
}
