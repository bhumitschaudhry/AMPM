import axios from 'axios';

export interface SafetyResult {
  isSafe: boolean;
  categories: Record<string, string>;
  flaggedCategory: string | null;
}

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';
const FLAGGED_LIKELIHOODS = new Set(['LIKELY', 'VERY_LIKELY']);
const SAFETY_CATEGORIES = ['adult', 'spoof', 'medical', 'violence', 'racy'] as const;

/** Check image content safety using Google Cloud Vision SafeSearch. */
export async function checkContentSafety(imageBuffer: Buffer): Promise<SafetyResult> {
  const base64Image = imageBuffer.toString('base64');

  const response = await axios.post(
    `${VISION_API_URL}?key=${process.env.GOOGLE_CLOUD_VISION_API_KEY}`,
    {
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'SAFE_SEARCH_DETECTION' }],
        },
      ],
    },
    { timeout: 30_000 },
  );

  const responses = response.data?.responses;
  if (!responses || !Array.isArray(responses) || responses.length === 0) {
    throw new Error('Invalid response structure from Google Cloud Vision API.');
  }

  const errorObj = responses[0]?.error;
  if (errorObj) {
    throw new Error(
      `Google Cloud Vision SafeSearch error: ${errorObj.message || 'Unknown error'} (code ${errorObj.code || 'unknown'})`
    );
  }

  const annotation = responses[0]?.safeSearchAnnotation ?? {};
  return buildSafetyResult(annotation);
}

/** Parse SafeSearch annotation into a structured SafetyResult. */
function buildSafetyResult(annotation: Record<string, string>): SafetyResult {
  const categories: Record<string, string> = {};
  let flaggedCategory: string | null = null;

  for (const category of SAFETY_CATEGORIES) {
    const likelihood = annotation[category] ?? 'UNKNOWN';
    categories[category] = likelihood;

    if (!flaggedCategory && FLAGGED_LIKELIHOODS.has(likelihood)) {
      flaggedCategory = category;
    }
  }

  return {
    isSafe: flaggedCategory === null,
    categories,
    flaggedCategory,
  };
}
