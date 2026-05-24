import { stripe } from "@/lib/stripe";
import { dbMarkRegistrationPaid, dbGetRegistrationWithTournament } from "@/lib/db/tournament";
import { sendEmail } from "@/lib/api/sterplatform";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const registrationId = session.metadata?.registration_id;

    if (!registrationId) {
      return NextResponse.json({ error: "registration_id manquant." }, { status: 400 });
    }

    await dbMarkRegistrationPaid(registrationId).catch((err) => {
      console.error("[webhook] Erreur mise à jour registration:", err);
    });

    const reg = await dbGetRegistrationWithTournament(registrationId).catch(() => null);
    if (reg) {
      await sendEmail('dartsopen_inscription_confirmation', reg.player_email, {
        nom_equipe: reg.player_name,
        tournoi: reg.tournament_name,
        date: reg.tournament_date,
        lieu: reg.tournament_location,
        joueurs: reg.player_names.join(', '),
      }).catch((err) => console.error('[webhook] Erreur envoi email confirmation:', err));
    }
  }

  return NextResponse.json({ received: true });
}
