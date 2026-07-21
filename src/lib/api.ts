export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (window.location.hostname.includes('github.io')) {
    return `https://ais-pre-4axwakkebuyu5jmnwv4g4w-422679104169.us-west1.run.app${cleanEndpoint}`;
  }
  return cleanEndpoint;
}
