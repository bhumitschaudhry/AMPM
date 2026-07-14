import axios from 'axios';

const HUGGINGFACE_CAPTION_URL =
  'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base';

/** Send image to HuggingFace BLIP model and return the generated caption. */
export async function generateCaption(imageBuffer: Buffer): Promise<string> {
  const response = await axios.post(HUGGINGFACE_CAPTION_URL, imageBuffer, {
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
      'Content-Type': 'application/octet-stream',
    },
    timeout: 30_000,
  });

  const [firstResult] = response.data as Array<{ generated_text: string }>;
  return firstResult.generated_text;
}
