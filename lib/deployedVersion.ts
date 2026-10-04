import packageJson from "@/package.json";

/**
 * Version déployée exposée par `GET /api/health` (Deployment-Standard §8 et §10) : c'est le
 * moyen officiel de vérifier depuis l'extérieur quelle version tourne réellement — le
 * 01/10/2026, la version servie par le hotfix de production n'a pas pu être confirmée faute de
 * cette information.
 *
 * Format : `<version package.json>+<SHA court>` quand le commit est connu, sinon la seule
 * version du package. Le SHA vient de `SOURCE_COMMIT`, variable prédéfinie que Coolify injecte
 * dans le conteneur ; `APP_COMMIT_SHA` permet de le fournir autrement (autre hébergeur, tests).
 * Lu au runtime et non au build : l'image est construite par Coolify, pas par la CI, et un SHA
 * figé au build serait faux si la variable n'est pas passée en argument de build.
 */
export function deployedVersion(env: Record<string, string | undefined> = process.env): string {
  const base = packageJson.version;
  const raw = (env.APP_COMMIT_SHA || env.SOURCE_COMMIT || "").trim();
  // Un SHA Git est hexadécimal : toute autre valeur (vide, « unknown », injection) est ignorée
  // pour ne jamais publier une chaîne arbitraire sur une route publique.
  if (!/^[0-9a-f]{7,40}$/i.test(raw)) return base;
  return `${base}+${raw.slice(0, 7).toLowerCase()}`;
}
