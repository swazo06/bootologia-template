/**
 * SSRF protection: only allow public http(s) URLs (no localhost, private, link-local).
 */
export class UrlSafetyError extends Error {
  readonly code = "FILE_NOT_ACCESSIBLE";

  constructor(message: string) {
    super(message);
    this.name = "UrlSafetyError";
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function isPrivateOrReservedIpv4(hostname: string): boolean {
  const n = ipv4ToInt(hostname);
  if (n === null) return false;
  const u = n >>> 0;
  // Compare as unsigned 32-bit (JS bitwise ops are signed Int32).
  const and = (mask: number, expected: number) =>
    ((u & mask) >>> 0) === (expected >>> 0);
  // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10
  if (and(0xff000000, 0x00000000)) return true;
  if (and(0xff000000, 0x0a000000)) return true;
  if (and(0xff000000, 0x7f000000)) return true;
  if (and(0xffff0000, 0xa9fe0000)) return true;
  if (and(0xfff00000, 0xac100000)) return true;
  if (and(0xffff0000, 0xc0a80000)) return true;
  if (and(0xffc00000, 0x64400000)) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (host.includes(":")) {
    // IPv6: block loopback / link-local / unique-local
    if (
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80")
    ) {
      return true;
    }
  }
  if (isPrivateOrReservedIpv4(host)) return true;
  return false;
}

export function assertPublicHttpUrl(url: string): URL {
  if (!url?.trim() || url.includes("inaccessible")) {
    throw new UrlSafetyError(`Media URL is not publicly accessible: ${url}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UrlSafetyError(`Invalid media URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlSafetyError(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new UrlSafetyError(`Blocked host (SSRF): ${parsed.hostname}`);
  }
  return parsed;
}

export function isPublicHttpUrl(url: string): boolean {
  try {
    assertPublicHttpUrl(url);
    return true;
  } catch {
    return false;
  }
}
