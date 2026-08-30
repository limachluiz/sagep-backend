const PRIVATE_IPV4_RANGES = [
  { start: ipv4ToNumber("10.0.0.0"), end: ipv4ToNumber("10.255.255.255") },
  { start: ipv4ToNumber("172.16.0.0"), end: ipv4ToNumber("172.31.255.255") },
  { start: ipv4ToNumber("192.168.0.0"), end: ipv4ToNumber("192.168.255.255") },
] as const;

export function ipv4ToNumber(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || String(Number(part)) !== part)) return -1;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return -1;
  return (((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!) >>> 0;
}

export function isPrivateIpv4(value: string) {
  const address = ipv4ToNumber(value);
  return address >= 0 && PRIVATE_IPV4_RANGES.some((range) => address >= range.start && address <= range.end);
}

export function isCanonicalPrivateIpv4Cidr(value: string) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/.exec(value);
  if (!match) return false;

  const address = ipv4ToNumber(match[1]!);
  const prefix = Number(match[2]);
  if (address < 0) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  if (network !== address) return false;

  return PRIVATE_IPV4_RANGES.some((range) => network >= range.start && broadcast <= range.end);
}

export function normalizePrivateIpv4Cidrs(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
