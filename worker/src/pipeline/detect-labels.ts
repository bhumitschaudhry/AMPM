import axios from 'axios';

interface Label {
  name: string;
  score: number;
}

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/** Detect up to 10 labels in an image using Google Cloud Vision. */
export async function detectLabels(imageBuffer: Buffer): Promise<Label[]> {
  const base64Image = imageBuffer.toString('base64');

  const response = await axios.post(
    `${VISION_API_URL}?key=${process.env.GOOGLE_CLOUD_VISION_API_KEY}`,
    {
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'LABEL_DETECTION', maxResults: 10 }],
        },
      ],
    },
    { timeout: 30_000 },
  );

  const annotations = response.data.responses[0]?.labelAnnotations;
  if (!annotations) return [];

  return annotations.map((annotation: { description: string; score: number }) => ({
    name: annotation.description,
    score: annotation.score,
  }));
}
