import { createClient } from "@supabase/supabase-js";

// Client avec la service role key — contourne le RLS
// À utiliser uniquement dans les API routes serveur (webhooks, cron)
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
