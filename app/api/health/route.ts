import { NextResponse } from "next/server";
import { deployedVersion } from "@/lib/deployedVersion";

/**
 * Liveness du standard de déploiement (Deployment-Standard §8) : consommée par le HEALTHCHECK
 * Docker, Coolify et la surveillance externe. AUCUNE dépendance externe — une base
 * indisponible ne doit jamais faire basculer un conteneur sain en « unhealthy » (leçon
 * SterPlatform/Mercure). L'état de PostgreSQL est publié par `/health/ready`, pas ici.
 */
export async function GET() {
  try {
    return NextResponse.json({ status: "ok", version: deployedVersion() });
  } catch (err) {
    // Ne jamais transformer un incident de lecture de version en panne apparente du service.
    console.error("[health] Lecture de la version déployée impossible :", err);
    return NextResponse.json({ status: "ok", version: "unknown" });
  }
}
