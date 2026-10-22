// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor, isTrustedProxy, TRUSTED_PROXY_RANGES } from "./clientIp";

// ADR-0024 — adresse du visiteur = entrée la plus à droite de X-Forwarded-For hors relais de
// confiance. Ces cas reprennent les situations réelles : Traefik seul (aujourd'hui), Cloudflare
// devant Traefik (demain), relais BSsite → SterPlatform par le domaine public.
describe("clientIpFromForwardedFor (ADR-0024)", () => {
  it("entrée unique (Traefik sans confiance, situation actuelle) : cette entrée", () => {
    expect(clientIpFromForwardedFor("203.0.113.5")).toBe("203.0.113.5");
  });

  it("derrière Cloudflare : la vraie adresse, pas la forge à gauche ni le relais à droite", () => {
    expect(clientIpFromForwardedFor("198.51.100.66, 203.0.113.5, 104.16.0.1")).toBe("203.0.113.5");
  });

  it("une forge différente à gauche ne change pas l'adresse retenue", () => {
    const a = clientIpFromForwardedFor("9.9.9.1, 203.0.113.5, 104.16.0.1");
    const b = clientIpFromForwardedFor("9.9.9.2, 203.0.113.5, 104.16.0.1");
    expect(a).toBe("203.0.113.5");
    expect(b).toBe(a);
  });

  it("visiteur IPv6 derrière un relais Cloudflare IPv6", () => {
    expect(clientIpFromForwardedFor("2001:db8::1, 2606:4700::6810:1")).toBe("2001:db8::1");
    expect(clientIpFromForwardedFor("2001:db8::1, 2a06:98c7::1")).toBe("2001:db8::1");
  });

  it("saute l'adresse du serveur (relais BSsite → SterPlatform par le domaine public)", () => {
    expect(clientIpFromForwardedFor("203.0.113.5, 31.220.75.69")).toBe("203.0.113.5");
    expect(clientIpFromForwardedFor("203.0.113.5, 2a02:c207:2333:4963::1")).toBe("203.0.113.5");
    expect(clientIpFromForwardedFor("203.0.113.5, 104.16.0.1, 31.220.75.69, 10.0.1.4")).toBe("203.0.113.5");
  });

  it("toutes les entrées de confiance : la plus à gauche", () => {
    expect(clientIpFromForwardedFor("10.0.0.7, 172.18.0.2")).toBe("10.0.0.7");
    expect(clientIpFromForwardedFor("127.0.0.1")).toBe("127.0.0.1");
  });

  it("en-tête absent ou vide : undefined (l'appelant garde son repli)", () => {
    expect(clientIpFromForwardedFor(null)).toBeUndefined();
    expect(clientIpFromForwardedFor(undefined)).toBeUndefined();
    expect(clientIpFromForwardedFor("")).toBeUndefined();
    expect(clientIpFromForwardedFor(" , ,")).toBeUndefined();
  });

  it("nettoie espaces, ports, crochets et IPv4 mappée", () => {
    expect(clientIpFromForwardedFor("  203.0.113.5:4321 ,104.16.0.1 ")).toBe("203.0.113.5");
    expect(clientIpFromForwardedFor("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(clientIpFromForwardedFor("::ffff:203.0.113.5, ::ffff:104.16.0.1")).toBe("203.0.113.5");
  });

  it("une entrée illisible n'est jamais sautée (elle ne peut pas masquer ce qui est à sa gauche)", () => {
    expect(clientIpFromForwardedFor("203.0.113.5, n-importe-quoi, 104.16.0.1")).toBe("n-importe-quoi");
  });
});

describe("isTrustedProxy (ADR-0024)", () => {
  it("bornes des plages", () => {
    expect(isTrustedProxy("172.16.0.0")).toBe(true);
    expect(isTrustedProxy("172.31.255.255")).toBe(true);
    expect(isTrustedProxy("172.32.0.0")).toBe(false);
    expect(isTrustedProxy("104.23.255.255")).toBe(true);
    expect(isTrustedProxy("104.24.0.0")).toBe(true);
    expect(isTrustedProxy("104.28.0.0")).toBe(false);
    expect(isTrustedProxy("31.220.75.70")).toBe(false);
    expect(isTrustedProxy("fd12::1")).toBe(true);
    expect(isTrustedProxy("fe80::1")).toBe(false);
    expect(isTrustedProxy("::1")).toBe(true);
    expect(isTrustedProxy("2a02:c207:2333:4963::2")).toBe(false);
  });

  it("la liste contient le repère de maintenance de l'ADR-0024 et se charge sans erreur", () => {
    expect(TRUSTED_PROXY_RANGES).toContain("173.245.48.0/20");
    expect(TRUSTED_PROXY_RANGES).toHaveLength(30);
  });
});
