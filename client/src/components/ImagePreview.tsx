import { useEffect, useState } from 'react';
import api from '../api';

interface ImagePreviewProps {
  jobId: string;
  imageId: string;
  alt: string;
}

/** Load an owned image with the current bearer token and render a temporary object URL. */
export default function ImagePreview({ jobId, imageId, alt }: ImagePreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    api.get(`/jobs/${jobId}/images/${imageId}/file`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        setImageUrl(objectUrl);
      })
      .catch(() => setImageUrl(null));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, jobId]);

  if (!imageUrl) return <div className="image-preview" aria-label={`Preview unavailable for ${alt}`} />;

  return <img src={imageUrl} alt={alt} className="image-preview" />;
}
