import crypto from "node:crypto";

/** PKCE (RFC 7636) côté BApp — S256 uniquement, symétrique à SterPlatform (App\Security\Sso\Pkce). */
export function generateVerifier(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function challengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}
