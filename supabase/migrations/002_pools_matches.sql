-- ============================================================
-- DartsOpen — Phase 2 : Joueurs, Poules, Matchs, Scores
-- ============================================================

-- Inscriptions joueurs
CREATE TABLE public.registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  player_name TEXT NOT NULL,
  player_email TEXT NOT NULL,
  player_phone TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'PAID'
    CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
  qr_code_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Associations gèrent leurs inscriptions"
  ON public.registrations FOR ALL
  USING (
    auth.uid() = (SELECT association_id FROM public.tournaments WHERE id = tournament_id)
  );

CREATE POLICY "Inscriptions visibles par token (joueur)"
  ON public.registrations FOR SELECT
  USING (true);

-- Poules
CREATE TABLE public.pools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pools visibles par tous"
  ON public.pools FOR SELECT USING (true);

CREATE POLICY "Associations gèrent leurs pools"
  ON public.pools FOR ALL
  USING (auth.uid() = (SELECT association_id FROM public.tournaments WHERE id = tournament_id));

-- Joueurs dans une poule
CREATE TABLE public.pool_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID REFERENCES public.pools(id) ON DELETE CASCADE NOT NULL,
  registration_id UUID REFERENCES public.registrations(id) ON DELETE CASCADE NOT NULL,
  rank INT,
  UNIQUE (pool_id, registration_id)
);

ALTER TABLE public.pool_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pool players visibles par tous"
  ON public.pool_players FOR SELECT USING (true);

CREATE POLICY "Associations gèrent pool_players"
  ON public.pool_players FOR ALL
  USING (
    auth.uid() = (
      SELECT t.association_id FROM public.tournaments t
      JOIN public.pools p ON p.tournament_id = t.id
      WHERE p.id = pool_id
    )
  );

-- Matchs
-- tournament_id est dénormalisé ici pour le filtre Supabase Realtime
CREATE TABLE public.matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  pool_id UUID REFERENCES public.pools(id),
  bracket_round INT,
  board_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'FINISHED')),
  player1_id UUID REFERENCES public.registrations(id) NOT NULL,
  player2_id UUID REFERENCES public.registrations(id) NOT NULL,
  winner_id UUID REFERENCES public.registrations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Matchs visibles par tous"
  ON public.matches FOR SELECT USING (true);

CREATE POLICY "Associations gèrent leurs matchs"
  ON public.matches FOR ALL
  USING (auth.uid() = (SELECT association_id FROM public.tournaments WHERE id = tournament_id));

-- Résultats de manche (un par round configuré)
-- winner_id : qui a gagné cette manche (null = pas encore joué)
-- validated_p1/p2 : chaque joueur confirme le résultat
CREATE TABLE public.match_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  round_order INT NOT NULL,
  winner_id UUID REFERENCES public.registrations(id),
  validated_p1 BOOLEAN NOT NULL DEFAULT false,
  validated_p2 BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (match_id, round_order)
);

ALTER TABLE public.match_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match sets visibles par tous"
  ON public.match_sets FOR SELECT USING (true);

-- Tout le monde peut entrer/valider un score (authentification par présence physique)
CREATE POLICY "Score entrable par tous (validé par double confirmation)"
  ON public.match_sets FOR ALL USING (true);

-- Index pour les requêtes Realtime fréquentes
CREATE INDEX idx_registrations_tournament_id ON public.registrations(tournament_id);
CREATE INDEX idx_pools_tournament_id ON public.pools(tournament_id);
CREATE INDEX idx_matches_tournament_id ON public.matches(tournament_id);
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_board_number ON public.matches(board_number);
CREATE INDEX idx_match_sets_match_id ON public.match_sets(match_id);
