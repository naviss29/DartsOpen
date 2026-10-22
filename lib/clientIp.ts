/**
 * Adresse IP du visiteur — règle unique de l'ADR-0024
 * (BApps-Studio/11-ADR/ADR-0024-Adresse-IP-Visiteur.md, qui fait foi).
 *
 * Règle : l'adresse du visiteur est l'entrée la plus à DROITE de `X-Forwarded-For` qui
 * n'appartient pas à un relais de confiance. Pourquoi la droite : chaque relais AJOUTE à droite
 * l'adresse de la connexion qu'il reçoit ; un visiteur qui écrit lui-même l'en-tête ne peut donc
 * placer ses valeurs qu'à gauche de sa vraie adresse. Lire la première entrée la rendrait
 * falsifiable dès que Traefik conserve l'en-tête reçu de Cloudflare ; lire la dernière ferait
 * partager un seul compteur à tous les visiteurs passant par le même relais Cloudflare.
 * On ne lit jamais `CF-Connecting-IP` ni `X-Real-Ip` seuls (falsifiables tant que le serveur
 * reste joignable en direct).
 *
 * Fonction pure, sans dépendance externe (ni `node:net`) : elle doit aussi tourner dans
 * `proxy.ts` et rester triviale à recopier dans les autres produits.
 */

/**
 * Relais de confiance — LA MÊME LISTE dans tous les produits (ADR-0024, point 2).
 * Si Cloudflare publie de nouvelles plages, les ajouter d'abord à l'ADR-0024 puis partout
 * (rechercher `173.245.48.0/20` dans les dépôts).
 */
export const TRUSTED_PROXY_RANGES: readonly string[] = [
  // Réseaux privés (Docker, loopback).
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "::1/128",
  "fc00::/7",
  // Le serveur lui-même : un produit qui en appelle un autre par son domaine public
  // (ex. BSsite → SterPlatform) arrive avec l'adresse publique du serveur.
  "31.220.75.69/32",
  "2a02:c207:2333:4963::1/128",
  // Cloudflare IPv4 (https://www.cloudflare.com/ips/, relevé du 22/10/2026).
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  // Cloudflare IPv6 (même relevé).
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

type ParsedIp = { version: 4 | 6; bytes: number[] };
type Cidr = ParsedIp & { prefix: number };

function parseIPv4(value: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
  const bytes = value.split(".").map(Number);
  return bytes.every((b) => b <= 255) ? bytes : null;
}

function parseIPv6(input: string): number[] | null {
  // Identifiant de zone (`fe80::1%eth0`) : sans effet sur l'appartenance à une plage.
  let value = input.split("%")[0];
  // Adresse IPv4 en fin d'adresse (`::ffff:1.2.3.4`) : convertie en deux groupes hexadécimaux.
  const lastColon = value.lastIndexOf(":");
  if (value.includes(".", lastColon)) {
    const v4 = parseIPv4(value.slice(lastColon + 1));
    if (!v4) return null;
    value =
      value.slice(0, lastColon + 1) +
      ((v4[0] << 8) | v4[1]).toString(16) +
      ":" +
      ((v4[2] << 8) | v4[3]).toString(16);
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + tail.length > 7) return null;

  const groups = [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const n = parseInt(group, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

function parseIp(value: string): ParsedIp | null {
  const v4 = parseIPv4(value);
  if (v4) return { version: 4, bytes: v4 };
  if (!value.includes(":")) return null;
  const v6 = parseIPv6(value);
  if (!v6) return null;
  // IPv4 mappée (`::ffff:a.b.c.d`) : c'est une adresse IPv4, comparée aux plages IPv4.
  const isMapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff;
  return isMapped ? { version: 4, bytes: v6.slice(12) } : { version: 6, bytes: v6 };
}

function parseCidr(range: string): Cidr {
  const [address, prefixText] = range.split("/");
  const parsed = parseIp(address);
  const prefix = Number(prefixText);
  if (!parsed || !Number.isInteger(prefix) || prefix < 0 || prefix > parsed.bytes.length * 8) {
    // Erreur de programmation dans la constante ci-dessus : on échoue au chargement du module
    // plutôt que de faire silencieusement confiance (ou défiance) à une mauvaise plage.
    throw new Error(`ADR-0024 : plage de relais de confiance invalide « ${range} »`);
  }
  return { ...parsed, prefix };
}

const TRUSTED_CIDRS: readonly Cidr[] = TRUSTED_PROXY_RANGES.map(parseCidr);

function inCidr(ip: ParsedIp, cidr: Cidr): boolean {
  if (ip.version !== cidr.version) return false;
  let bits = cidr.prefix;
  for (let i = 0; bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if ((ip.bytes[i] & mask) !== (cidr.bytes[i] & mask)) return false;
  }
  return true;
}

/** Vrai si `ip` (déjà nettoyée) appartient à un relais de confiance de l'ADR-0024. */
export function isTrustedProxy(ip: string): boolean {
  const parsed = parseIp(ip);
  return parsed !== null && TRUSTED_CIDRS.some((cidr) => inCidr(parsed, cidr));
}

/**
 * Nettoie une entrée : espaces, crochets IPv6 (`[2001:db8::1]:443`), port IPv4
 * (`203.0.113.5:1234`), IPv4 mappée ramenée à sa forme IPv4. Une entrée illisible est rendue
 * telle quelle : elle est traitée comme NON fiable (jamais sautée), donc ne peut pas servir à
 * masquer une adresse placée à sa gauche.
 */
function cleanEntry(entry: string): string {
  let value = entry.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) {
    value = bracketed[1];
  } else {
    const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
    if (v4WithPort) value = v4WithPort[1];
  }
  const parsed = parseIp(value);
  if (parsed?.version === 4 && value.includes(":")) return parsed.bytes.join(".");
  return value;
}

/**
 * Adresse du visiteur d'après `X-Forwarded-For` (ADR-0024) : l'entrée la plus à droite qui
 * n'est pas un relais de confiance ; si toutes le sont, la plus à gauche ; `undefined` si
 * l'en-tête est absent ou vide (l'appelant applique alors son propre repli).
 */
export function clientIpFromForwardedFor(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const entries = header
    .split(",")
    .map(cleanEntry)
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return undefined;

  for (let i = entries.length - 1; i >= 0; i--) {
    if (!isTrustedProxy(entries[i])) return entries[i];
  }
  // Toutes les entrées sont des relais de confiance (appel interne, tests locaux) : la plus à
  // gauche est la plus proche de l'origine de la requête.
  return entries[0];
}
