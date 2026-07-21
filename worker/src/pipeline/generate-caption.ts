import dns from 'node:dns';
import axios from 'axios';
import { recordBlipTokenAnalysis } from '../telemetry';
import { httpsAgentWithDnsFallback } from './https-agent-with-dns-fallback';

/** Extract the network error code (e.g. ENOTFOUND) from an unknown catch value. */
function getAxiosErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  ) {
    return (error as Record<string, unknown>).code as string;
  }
  return undefined;
}

interface AxiosLikeResponse {
  status?: number;
  data?: unknown;
}

/** Extract the HTTP response object from an unknown axios catch value. */
function getAxiosResponse(error: unknown): AxiosLikeResponse | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response: AxiosLikeResponse }).response;
  }
  return undefined;
}

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
  const startTime = Date.now();

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

      const caption = firstResult.generated_text;
      recordBlipTokenAnalysis({
        imageBuffer,
        caption,
        durationMs: Date.now() - startTime,
        isSuccess: true,
      });
      return caption;
    } catch (error) {
      lastError = error;

      const response = getAxiosResponse(error);
      const responseStatus = response?.status;
      const responseData = response?.data;
      const isUnsupported =
        responseStatus === 400 &&
        typeof responseData === 'object' &&
        responseData !== null &&
        ((responseData as Record<string, string>).error?.includes('not supported') ||
          (responseData as Record<string, string>).error?.includes('Model not supported'));

      if (isUnsupported) {
        console.warn(
          '[WARN] HuggingFace model Salesforce/blip-image-captioning-base is decommissioned or unsupported. Returning fallback caption.',
        );
        recordBlipTokenAnalysis({
          imageBuffer,
          caption: 'An uploaded image',
          durationMs: Date.now() - startTime,
          isSuccess: true,
        });
        return 'An uploaded image';
      }

      const code = getAxiosErrorCode(error);
      // API-level errors (bad response, model loading) are host-independent —
      // don't waste a fallback attempt, surface them immediately.
      const isNetworkError =
        Boolean(code) &&
        [
          'ENOTFOUND',
          'EAI_AGAIN',
          'ECONNREFUSED',
          'ENETUNREACH',
          'ECONNRESET',
          'ETIMEDOUT',
          'ECONNABORTED',
        ].includes(code!);
      if (!isNetworkError) {
        recordBlipTokenAnalysis({
          imageBuffer,
          durationMs: Date.now() - startTime,
          isSuccess: false,
        });
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`HuggingFace request failed${code ? ` (${code})` : ''}: ${message}`);
      }
      console.warn(
        `[WARN] HuggingFace host ${host} failed${code ? ` (${code})` : ''}; trying next host if available.`,
      );
    }
  }

  // All hosts failed — forward a clear network error for the retry/categorize path.
  recordBlipTokenAnalysis({
    imageBuffer,
    durationMs: Date.now() - startTime,
    isSuccess: false,
  });

  const code = getAxiosErrorCode(lastError);
  const finalError = new Error(
    `HuggingFace request failed${code ? ` (${code})` : ''}: all inference hosts unreachable`,
  );
  if (code) {
    Object.assign(finalError, { code });
  }
  throw finalError;
}
