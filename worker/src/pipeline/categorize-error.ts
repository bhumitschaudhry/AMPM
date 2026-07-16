interface CategorizedError {
  code: string;
  message: string;
}

/** Map pipeline errors to user-friendly codes and messages for DB storage. */
export function categorizeError(error: unknown): CategorizedError {
  if (!isErrorLike(error)) {
    return { code: 'INTERNAL_ERROR', message: 'Unexpected error during image processing.' };
  }

  if (typeof error.failureReason === 'string') {
    return {
      code: error.failureReason,
      message: error.message || 'Image failed validation before processing.',
    };
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return {
      code: 'AI_PROVIDER_TIMEOUT',
      message: 'AI service timed out. The image may be too large or the service is overloaded. Try again later.',
    };
  }

  // DNS resolution and connection failures are transient network errors —
  // e.g. `getaddrinfo ENOTFOUND api-inference.huggingface.co`. These are
  // retryable and must be reported clearly rather than as a generic
  // INTERNAL_ERROR so the user knows it's a network issue, not a bad upload.
  if (
    error.code === 'ENOTFOUND' ||
    error.code === 'EAI_AGAIN' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENETUNREACH' ||
    error.code === 'ECONNRESET' ||
    error.message?.includes('getaddrinfo')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Could not reach the AI service due to a network or DNS error. This is temporary — retries will continue.',
    };
  }

  const status = (error as any).response?.status;

  if (status === 401 || status === 403) {
    return {
      code: 'AI_PROVIDER_UNAUTHORIZED',
      message: `AI service refused authentication (HTTP ${status}). Please check your HUGGINGFACE_API_TOKEN and ensure it has "Make calls to Inference Providers" permission enabled in Hugging Face settings.`,
    };
  }

  if (status === 429) {
    return {
      code: 'AI_PROVIDER_RATE_LIMITED',
      message: 'AI service rate limited. Too many requests — please wait a few minutes and retry.',
    };
  }

  if (status && status >= 500) {
    return {
      code: 'AI_PROVIDER_ERROR',
      message: `AI service returned error (HTTP ${status}). This is a temporary issue — retry shortly.`,
    };
  }

  // sharp throws errors for corrupt or unreadable image files
  if (error.code === 'ENOENT' || error.message?.includes('Input file is missing')) {
    return {
      code: 'INVALID_FILE',
      message: 'Could not read image file. The file may be missing, corrupt, or not a valid image format.',
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: error.message || 'Unexpected error during image processing.',
  };
}

/** Type guard for objects shaped like an Error with optional axios/node properties. */
function isErrorLike(error: unknown): error is { code?: string; failureReason?: string; message?: string } {
  return typeof error === 'object' && error !== null;
}
