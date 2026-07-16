import axios from 'axios';
import dns from 'dns';
import { httpsAgentWithDnsFallback } from './https-agent-with-dns-fallback';

// HuggingFace inference hosts, tried in order. The canonical api-inference
// subdomain has been observed returning ENOTFOUND during DNS outages, so the
// primary endpoint is now router.huggingface.co using the hf-inference path
// (per HF docs: https://router.huggingface.co/hf-inference/models/<MODEL>).
// The legacy api-inference host is kept as a fallback in case it recovers.
const HUGGINGFACE_HOSTS = [
  'https://router.huggingface.co/hf-inference',
  'https://api-inference.huggingface.co',
];
const HUGGINGFACE_MODEL_PATH = '/models/Salesforce/blip-image-captioning-base';

// Public fallback resolvers used when the system resolver transiently fails.
const FALLBACK_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];
const DNS_RESOLVE_ATTEMPTS = 3;

/**
 * Best-effort warm-up of the given HuggingFace host DNS using the system
 * resolver, retrying with public fallback DNS servers. This absorbs transient
 * DNS failures (ENOTFOUND) by pre-populating the resolver cache, but it never
 * blocks the request: if every attempt fails we still let axios try.
 */
async function warmDnsResolution(host: string): Promise<void> {
  const servers = [undefined, ...FALLBACK_DNS_SERVERS];
  let hostname = host;
  try {
    hostname = new URL(host).hostname;
  } catch {
    // Keep host if it's not a valid URL (though it should be)
  }

  for (let attempt = 0; attempt < DNS_RESOLVE_ATTEMPTS; attempt++) {
    for (const server of servers) {
      const resolver = server ? new dns.Resolver({ timeout: 3000 }) : dns;
      if (server) resolver.setServers([server]);
      try {
        await new Promise<void>((resolve, reject) => {
          resolver.resolve4(hostname, (err) => (err ? reject(err) : resolve()));
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
  let lastError: unknown;

  // Try each HuggingFace host in turn so a DNS/network outage on one endpoint
  // (e.g. api-inference.huggingface.co ENOTFOUND) falls through to the next.
  for (const host of HUGGINGFACE_HOSTS) {
    try {
      await warmDnsResolution(host);

      const response = await axios.post(`${host}${HUGGINGFACE_MODEL_PATH}`, imageBuffer, {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
          'Content-Type': 'application/octet-stream',
          Connection: 'close',
        },
        timeout: 90_000,
        httpsAgent: httpsAgentWithDnsFallback,
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
      lastError = error;
      
      const responseStatus = error && typeof error === 'object' && 'response' in error ? (error as any).response?.status : undefined;
      const responseData = error && typeof error === 'object' && 'response' in error ? (error as any).response?.data : undefined;
      const isUnsupported = responseStatus === 400 &&
        (typeof responseData === 'object' && responseData !== null &&
         (responseData.error?.includes('not supported') || responseData.error?.includes('Model not supported')));

      if (isUnsupported) {
        console.warn('[WARN] HuggingFace model Salesforce/blip-image-captioning-base is decommissioned or unsupported. Returning fallback caption.');
        return 'An uploaded image';
      }

      const code = error && typeof error === 'object' && 'code' in error ? (error as any).code : undefined;
      // API-level errors (bad response, model loading) are host-independent —
      // don't waste a fallback attempt, surface them immediately.
      const isNetworkError = Boolean(code) && ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(code);
      if (!isNetworkError) {
        const message = error && typeof error === 'object' && 'message' in error ? (error as any).message : String(error);
        throw new Error(`HuggingFace request failed${code ? ` (${code})` : ''}: ${message}`);
      }
      console.warn(`[WARN] HuggingFace host ${host} failed${code ? ` (${code})` : ''}; trying next host if available.`);
    }
  }

  // All hosts failed — forward a clear network error for the retry/categorize path.
  const code = lastError && typeof lastError === 'object' && 'code' in lastError ? (lastError as any).code : undefined;
  const finalError = new Error(
    `HuggingFace request failed${code ? ` (${code})` : ''}: all inference hosts unreachable`,
  );
  if (code) {
    (finalError as any).code = code;
  }
  throw finalError;
}
