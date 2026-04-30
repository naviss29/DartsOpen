-- ============================================================
-- DartsOpen — Schéma initial (Phase 1)
-- ============================================================

-- Associations (profil étendu de auth.users)
CREATE TABLE public.associations (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  stripe_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chaque association voit uniquement ses propres données"
  ON public.associations FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Chaque association met à jour uniquement ses propres données"
  ON public.associations FOR UPDATE
  USING (auth.uid() = id);

-- Trigger : création automatique du profil association à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.associations (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Association sans nom'),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tournois
CREATE TABLE public.tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  association_id UUID REFERENCES public.associations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED')),
  max_players INT NOT NULL DEFAULT 16 CHECK (max_players > 0),
  entry_fee INT NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  nb_pools INT NOT NULL DEFAULT 4 CHECK (nb_pools > 0),
  nb_boards INT NOT NULL DEFAULT 4 CHECK (nb_boards > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- L'association gère ses propres tournois
CREATE POLICY "Associations gèrent leurs tournois"
  ON public.tournaments FOR ALL
  USING (auth.uid() = association_id);

-- Les tournois publics (OPEN, IN_PROGRESS, FINISHED) sont lisibles par tous
CREATE POLICY "Tournois publics visibles par tous"
  ON public.tournaments FOR SELECT
  USING (status IN ('OPEN', 'IN_PROGRESS', 'FINISHED'));

-- Manches (rounds)
CREATE TABLE public.rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  "order" INT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('CRICKET', '501', '701', '901', '1001')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('SINGLE', 'DOUBLE', 'TRIPLE')),
  finish_type TEXT NOT NULL CHECK (finish_type IN ('SINGLE', 'DOUBLE', 'TRIPLE', 'MASTER')),
  UNIQUE (tournament_id, "order")
);

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rounds visibles par tous"
  ON public.rounds FOR SELECT
  USING (true);

CREATE POLICY "Associations gèrent les rounds de leurs tournois"
  ON public.rounds FOR ALL
  USING (
    auth.uid() = (
      SELECT association_id FROM public.tournaments WHERE id = tournament_id
    )
  );

-- Index pour les requêtes fréquentes
CREATE INDEX idx_tournaments_association_id ON public.tournaments(association_id);
CREATE INDEX idx_tournaments_status ON public.tournaments(status);
CREATE INDEX idx_rounds_tournament_id ON public.rounds(tournament_id);
