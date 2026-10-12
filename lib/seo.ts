import type { Metadata } from "next";

const PRODUCTION_ORIGIN = "https://dartsopen.bapps-studio.com";
const PRIVATE_PREFIXES = ["/dashboard", "/api", "/tournaments", "/settings", "/login", "/p", "/classement"];

/** L'origine configurée est la source de vérité ; NODE_ENV vaut aussi production en recette. */
export function canIndexPublicPages(): boolean {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    return url.origin === PRODUCTION_ORIGIN && !url.username && !url.password
      && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function publicUrl(path = "/"): string {
  return new URL(path, PRODUCTION_ORIGIN).href;
}

export function publicMetadata(title: string, description: string, path: string, image?: string): Metadata {
  const url = publicUrl(path);
  const images = image ? [{ url: publicUrl(image) }] : undefined;
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index: canIndexPublicPages(), follow: true },
    openGraph: { title, description, url, type: "website", locale: "fr_FR", images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((item) => item.url) },
  };
}

export function shouldNoIndex(pathname: string): boolean {
  if (!canIndexPublicPages()) return true;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return true;
  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return true;
  if (/^\/t\/[^/]+\/(score|tv|live|register\/success)$/.test(path)) return true;
  return false;
}

/** Une description publiée peut contenir </script> : ne jamais l'injecter telle quelle. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
