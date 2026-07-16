import axios from 'axios';
import dns from 'dns';

const HUGGINGFACE_CAPTION_URL =
  'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base';

// Public fallback resolvers used when the system resolver transiently fails
// (e.g. intermittent `ENOTFOUND` for api-inference.huggingface.co).
const FALLBACK_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];
const DNS_RESOLVE_ATTEMPTS = 3;

/**
 * Best-effort warm-up of the HuggingFace host DNS using the system resolver,
 * retrying with public fallback DNS servers. This absorbs transient DNS
 * failures (ENOTFOUND) by pre-populating the resolver cache, but it never blocks
 * the request: if every attempt fails we still let axios attempt the call
 * (which performs its own resolution). Kept non-fatal so the real failure mode
 * (and BullMQ retry) is driven by the actual request, not the warm-up.
 */
async function warmDnsResolution(): Promise<void> {
  const host = new URL(HUGGINGFACE_CAPTION_URL).hostname;
  const servers = [undefined, ...FALLBACK_DNS_SERVERS];

  for (let attempt = 0; attempt < DNS_RESOLVE_ATTEMPTS; attempt++) {
    for (const server of servers) {
      const resolver = server ? new dns.Resolver({ timeout: 3000 }) : dns;
      if (server) resolver.setServers([server]);
      try {
        await new Promise<void>((resolve, reject) => {
          resolver.resolve4(host, (err) => (err ? reject(err) : resolve()));
        });
        return; // resolved successfully — warm cache and proceed
      } catch {
        // try next resolver / attempt
      }
    }
  }

  // Non-fatal: log and let the real axios call surface the network error.
  console.warn(`[WARN] Could not pre-resolve ${host}; proceeding with request anyway.`);
}

/** Send image to HuggingFace BLIP model and return the generated caption. */
export async function generateCaption(imageBuffer: Buffer): Promise<string> {
  try {
    // Stabilize DNS before the request: transient ENOTFOUND must not exhaust retries.
    await warmDnsResolution();

    const response = await axios.post(HUGGINGFACE_CAPTION_URL, imageBuffer, {
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        Connection: 'close',
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
  } catch (error) {
    // Surface DNS/network failures (e.g. ENOTFOUND) with a clear cause so the
    // retry path can report it as a transient network error, not a code bug.
    // axios sets `code` (e.g. ENOTFOUND) on the thrown error for network errors.
    if (error && typeof error === 'object' && 'code' in error && (error as any).code) {
      throw new Error(`HuggingFace request failed (${(error as any).code}): ${(error as any).message}`);
    }
    throw error;
  }
}
