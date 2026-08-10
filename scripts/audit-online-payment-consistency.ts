/**
 * DO-PAYMENT-GUARD-001 — étape 4 : audit en lecture seule des tournois existants.
 *
 * Identifie les tournois configurés en paiement en ligne (registration_mode = ONLINE et
 * entry_fee > 0) dont l'organisation propriétaire n'a PAS un Stripe Connect réellement
 * opérationnel (canReceivePayments !== true, source de vérité SterPlatform
 * PaymentAuthorizationService). Ne modifie AUCUNE donnée — rapport uniquement.
 *
 * Usage : npx tsx scripts/audit-online-payment-consistency.ts
 * Charge .env.local automatiquement (DATABASE_URL, NEXT_PUBLIC_API_URL, STER_API_TOKEN).
 */

import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) {
      const [, key, val] = match;
      if (!(key in process.env)) process.env[key] = val.replace(/^["']|["']$/g, "");
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL introuvable. Vérifie ton .env.local.");
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_API_URL || !process.env.STER_API_TOKEN) {
  console.error("NEXT_PUBLIC_API_URL / STER_API_TOKEN introuvables — nécessaires pour interroger SterPlatform.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type StripeConnectStatus = { stripeAccountId: string; status: string; canReceivePayments: boolean; reason: string | null };

async function getStripeConnectStatus(slug: string): Promise<StripeConnectStatus | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/internal/organizations/${encodeURIComponent(slug)}/connect/account-id`,
    { headers: { "X-App-Token": process.env.STER_API_TOKEN! } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SterPlatform connect status ${res.status} pour ${slug}`);
  return res.json() as Promise<StripeConnectStatus>;
}

async function main() {
  const onlinePaidTournaments = await prisma.tournament.findMany({
    where: { registrationMode: "ONLINE", entryFee: { gt: 0 } },
    select: { id: true, name: true, status: true, entryFee: true, userId: true },
  });

  console.log(`Tournois configurés en paiement en ligne (registration_mode=ONLINE, entry_fee>0) : ${onlinePaidTournaments.length}`);

  if (onlinePaidTournaments.length === 0) {
    console.log("Aucun tournoi à vérifier. Fin de l'audit.");
    return;
  }

  const userIds = [...new Set(onlinePaidTournaments.map((t) => t.userId))];
  const organizations = await prisma.organization.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, sterOrganizationSlug: true },
  });
  const orgByUserId = new Map(organizations.map((o) => [o.userId, o.sterOrganizationSlug]));

  // Un seul appel SterPlatform par organisation distincte, jamais un appel par tournoi.
  const uniqueSlugs = [...new Set([...orgByUserId.values()].filter((s): s is string => !!s))];
  const statusBySlug = new Map<string, StripeConnectStatus | null>();
  for (const slug of uniqueSlugs) {
    statusBySlug.set(slug, await getStripeConnectStatus(slug).catch((err) => {
      console.error(`  ⚠ Échec de lecture du statut Stripe pour ${slug} :`, err instanceof Error ? err.message : err);
      return null;
    }));
  }

  const inconsistent: typeof onlinePaidTournaments = [];
  const noOrganization: typeof onlinePaidTournaments = [];

  for (const t of onlinePaidTournaments) {
    const slug = orgByUserId.get(t.userId);
    if (!slug) {
      noOrganization.push(t);
      continue;
    }
    const status = statusBySlug.get(slug);
    if (!status?.canReceivePayments) {
      inconsistent.push(t);
    }
  }

  console.log("\n=== Résultat de l'audit (lecture seule — aucune donnée modifiée) ===\n");
  console.log(`Tournois payables en ligne SANS organisation liée du tout : ${noOrganization.length}`);
  for (const t of noOrganization) {
    console.log(`  - ${t.id} "${t.name}" (statut ${t.status}, ${(t.entryFee / 100).toFixed(2)} €/joueur, userId=${t.userId})`);
  }

  console.log(`\nTournois payables en ligne dont l'organisation n'a PAS Stripe Connect opérationnel : ${inconsistent.length}`);
  for (const t of inconsistent) {
    const slug = orgByUserId.get(t.userId);
    const status = slug ? statusBySlug.get(slug) : null;
    console.log(
      `  - ${t.id} "${t.name}" (statut ${t.status}, ${(t.entryFee / 100).toFixed(2)} €/joueur, organisation=${slug}, ` +
      `statut Stripe=${status?.status ?? "inconnu (compte absent ou lecture impossible)"})`
    );
  }

  const totalIncoherent = noOrganization.length + inconsistent.length;
  console.log(`\nTotal des tournois incohérents identifiés : ${totalIncoherent} / ${onlinePaidTournaments.length}`);
  console.log("\nAucune donnée n'a été modifiée par ce script.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
