export type GameType = "CRICKET" | "501" | "701" | "901" | "1001";
export type EntryType = "SINGLE" | "DOUBLE" | "TRIPLE";
export type FinishType = "SINGLE" | "DOUBLE" | "TRIPLE" | "MASTER";
export type TournamentStatus = "DRAFT" | "OPEN" | "IN_PROGRESS" | "FINISHED";
export type MatchStatus = "PENDING" | "IN_PROGRESS" | "FINISHED";
export type RegistrationStatus = "PENDING" | "PAID" | "CANCELLED";

export interface Association {
  id: string;
  name: string;
  email: string;
  stripe_account_id: string | null;
  created_at: string;
}

export interface Round {
  id: string;
  tournament_id: string;
  order: number;
  game_type: GameType;
  entry_type: EntryType;
  finish_type: FinishType;
}

export interface Tournament {
  id: string;
  association_id: string;
  name: string;
  date: string;
  location: string;
  status: TournamentStatus;
  max_players: number;
  entry_fee: number;
  nb_pools: number;
  nb_boards: number;
  rounds: Round[];
  created_at: string;
}

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

export interface Pool {
  id: string;
  tournament_id: string;
  name: string;
  players: PoolPlayer[];
}

export interface PoolPlayer {
  pool_id: string;
  registration_id: string;
  rank: number | null;
  registration?: Registration;
}

export interface MatchSet {
  id: string;
  match_id: string;
  round_id: string;
  score_p1: number;
  score_p2: number;
  winner_id: string | null;
  validated_p1: boolean;
  validated_p2: boolean;
}

export interface Match {
  id: string;
  pool_id: string | null;
  bracket_round: number | null;
  board_number: number;
  status: MatchStatus;
  player1_id: string;
  player2_id: string;
  sets: MatchSet[];
  player1?: Registration;
  player2?: Registration;
}
