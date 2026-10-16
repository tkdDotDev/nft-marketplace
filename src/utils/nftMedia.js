// Turns an ipfs:// URI into a fetchable gateway URL. Leaves http(s) URLs untouched
// (this covers ipfs.dweb.link / gateway links too).
export function resolveUri(uri) {
  if (!uri) return uri;
  if (uri.startsWith("ipfs://")) {
    return "https://ipfs.io/ipfs/" + uri.slice("ipfs://".length);
  }
  return uri;
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|$)/i;

// True if the URL is obviously a direct image link (either the path or a
// ?filename=... query param ends in a common image extension).
function looksLikeImageUrl(url) {
  try {
    const u = new URL(url);
    if (IMAGE_EXTENSIONS.test(u.pathname)) return true;
    const filename = u.searchParams.get("filename");
    if (filename && IMAGE_EXTENSIONS.test(filename)) return true;
  } catch (_) {
    // Not a parseable absolute URL — fall through to a plain regex check.
  }
  return IMAGE_EXTENSIONS.test(url);
}

const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Fetches whatever the tokenURI points to and figures out the actual image to show.
// Handles two cases people commonly end up with:
//  1. tokenURI -> proper metadata JSON: { name, description, image }
//  2. tokenURI -> a direct link to the image itself (not JSON)
//
// IMPORTANT: this always resolves (never hangs forever). Public IPFS gateways
// (dweb.link, ipfs.io, etc.) can be slow, rate-limited, or block cross-origin
// `fetch()` even when the browser can render the same URL fine via a plain <img>
// tag. So:
//  - if the URL obviously points straight at an image (extension in the path or a
//    ?filename=...jpg param), we skip fetching it entirely and just use it as the
//    <img> src directly — no network round trip, no CORS exposure.
//  - otherwise we fetch it (assuming it's metadata JSON) with a timeout, and on any
//    failure return { image: null, failed: true } so the UI can show "Image
//    unavailable" instead of being stuck on "Loading image..." forever.
export async function fetchNFTMedia(rawUri) {
  const url = resolveUri(rawUri);
  if (!url) return { image: null, name: null, description: null, failed: true };

  if (looksLikeImageUrl(url)) {
    return { image: url, name: null, description: null, failed: false };
  }

  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      return { image: null, name: null, description: null, failed: true };
    }
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return {
        image: resolveUri(json.image) || url,
        name: json.name || null,
        description: json.description || null,
        failed: false,
      };
    } catch {
      // Not JSON — the tokenURI itself is the image/media link
      return { image: url, name: null, description: null, failed: false };
    }
  } catch (err) {
    // Includes AbortError from the timeout, network failures, CORS issues, etc.
    return { image: null, name: null, description: null, failed: true };
  }
}
