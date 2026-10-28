/**
 * Masque une adresse e-mail avant un journal : `alan@exemple.fr` → `a***@exemple.fr`.
 *
 * Pourquoi : les journaux du conteneur (Coolify, Better Stack) ne doivent pas contenir de
 * données personnelles inutiles (RGPD). La première lettre et le domaine suffisent à
 * diagnostiquer un rejet d'envoi sans identifier le joueur. Même règle que SterPlatform
 * (`App\Logging\EmailMasker`).
 */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim();
  if (!value) return "";
  const at = value.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${Array.from(value)[0]}***${value.slice(at)}`;
}
