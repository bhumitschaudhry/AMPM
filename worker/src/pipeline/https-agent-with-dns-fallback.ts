import https from 'https';
import dns from 'dns';

const FALLBACK_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

const fallbackResolver = new dns.Resolver({ timeout: 3000 });
fallbackResolver.setServers(FALLBACK_DNS_SERVERS);

/** Perform a DNS lookup, falling back to public DNS resolvers if the system resolver fails. */
function lookupWithFallback(
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
): void {
  dns.lookup(hostname, options, (systemErr, address, family) => {
    if (!systemErr) {
      callback(null, address, family);
      return;
    }

    fallbackResolver.resolve4(hostname, (fallbackErr, addresses) => {
      if (fallbackErr || !addresses || addresses.length === 0) {
        callback(systemErr, '', 4);
        return;
      }
      callback(null, addresses[0], 4);
    });
  });
}

/** Custom HTTPS Agent configured with a DNS-fallback lookup function to survive local DNS outages. */
export const httpsAgentWithDnsFallback = new https.Agent({
  lookup: lookupWithFallback,
  keepAlive: true,
});
