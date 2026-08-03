import { redirect } from "next/navigation";
import { ssoStartPath } from "@/lib/sso/redirect";

/**
 * Plus de formulaire local (migration écosystème SSO) — BSsite est l'unique portail de
 * connexion visible. Toute visite de /login (lien historique, favori...) est immédiatement
 * redirigée vers /api/auth/sso/start, qui ouvre sa propre transaction avant de renvoyer vers
 * SterPlatform puis BSsite.
 */
export default function LoginPage() {
  redirect(ssoStartPath());
}
