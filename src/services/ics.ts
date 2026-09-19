import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-side fetch of a calendar feed the student pasted. The URL is user
 * input and we request it from our own network, so this refuses anything that
 * is not a public https host: no localhost, no private ranges, no credentials,
 * bounded redirects, bounded size and time. One known gap: the name is resolved
 * once here and again by fetch, so a hostile DNS server could rebind between
 * the two. Acceptable for a demo with synthetic data; a real deployment should
 * pin the resolved address.
 */
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export class IcsFetchError extends Error {}

/** True for loopback, private, link-local, carrier-grade NAT, unspecified and multicast addresses. */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = a.startsWith("::ffff:") ? a.slice(7) : a;
  if (isIP(v4) === 4) {
    const [p, q] = v4.split(".").map(Number);
    return p === 0 || p === 10 || p === 127 || p >= 224 || (p === 100 && q >= 64 && q <= 127) || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168);
  }
  if (isIP(a) === 6) return a === "::" || a === "::1" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb") || a.startsWith("ff");
  return false;
}

/** Shape checks that need no network. Returns the normalised https URL or throws. */
export function checkUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim().replace(/^webcal:/i, "https:")); } catch { throw new IcsFetchError("not a valid URL"); }
  if (u.protocol !== "https:") throw new IcsFetchError("only https calendar links are accepted");
  if (u.username || u.password) throw new IcsFetchError("links with embedded credentials are not accepted");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || (!host.includes(".") && isIP(host.replace(/^\[|\]$/g, "")) === 0)) throw new IcsFetchError("that host is not reachable from the server");
  if (isPrivateAddress(host)) throw new IcsFetchError("that address is not reachable from the server");
  return u;
}

async function assertPublic(u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;
  let addrs: { address: string }[];
  try { addrs = await lookup(host, { all: true }); } catch { throw new IcsFetchError("could not resolve that host"); }
  if (addrs.length === 0 || addrs.some((x) => isPrivateAddress(x.address))) throw new IcsFetchError("that host is not reachable from the server");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new IcsFetchError("calendar is larger than 3 MB"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchIcs(raw: string): Promise<string> {
  let u = checkUrlShape(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(u);
    let res: Response;
    try {
      res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/calendar, text/plain, */*" } });
    } catch { throw new IcsFetchError("could not reach the calendar link"); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new IcsFetchError("redirect without a location");
      u = checkUrlShape(new URL(loc, u).toString());
      continue;
    }
    if (!res.ok) throw new IcsFetchError(`calendar link answered ${res.status}`);
    const text = await readCapped(res);
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcsFetchError("that link did not return an iCalendar (.ics) feed");
    return text;
  }
  throw new IcsFetchError("too many redirects");
}
