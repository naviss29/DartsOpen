export type TournamentStatus = "DRAFT" | "OPEN" | "IN_PROGRESS" | "FINISHED";
export type RegistrationStatus = "PENDING" | "PAID" | "CANCELLED";

export interface Registration {
  id: string;
  tournament_id: string;
  player_name: string;
  player_email: string;
  player_phone: string | null;
  stripe_payment_intent_id: string | null;
  status: RegistrationStatus;
  qr_code_token: string;
  created_at: string;
}
