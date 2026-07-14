export interface User {
  id: string;
  email: string;
}

export interface Image {
  id: string;
  jobId: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  retryCount: number;
  failureReason: string | null;
  failureMessage: string | null;
  caption: string | null;
  labels: Array<{ name: string; score: number }> | null;
  safetyResult: {
    isSafe: boolean;
    categories: Record<string, string>;
    flaggedCategory: string | null;
  } | null;
  isFlagged: boolean;
  flaggedCategory: string | null;
  createdAt: string;
}

export interface Job {
  id: string;
  createdAt: string;
  status: string;
  images: Image[];
  imageCount?: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  imageId: string | null;
  jobId: string | null;
  createdAt: string;
}
