import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
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

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("registrations")
      .update({ status: "PAID" })
      .eq("id", registrationId)
      .eq("status", "PENDING");

    if (error) {
      console.error("[webhook] Erreur mise à jour registration:", error.message);
      return NextResponse.json({ error: "Erreur base de données." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
