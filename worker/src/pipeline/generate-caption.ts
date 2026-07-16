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

  if (!response.data) {
    throw new Error('Empty response from HuggingFace caption API');
  }

  if (typeof response.data === 'object' && 'error' in response.data) {
    throw new Error(`HuggingFace API error: ${response.data.error || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error('Invalid response structure from HuggingFace caption API');
  }

  const firstResult = response.data[0];
  if (!firstResult || typeof firstResult.generated_text !== 'string') {
    throw new Error('HuggingFace caption API response is missing generated text');
  }

  return firstResult.generated_text;
}
