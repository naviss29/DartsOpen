-- ============================================================
-- DartsOpen — Phase 5 : Phases finales (bracket)
-- ============================================================

-- Nombre de qualifiés par poule pour les phases finales
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS advancement_per_pool INT NOT NULL DEFAULT 1;

-- Position du match dans un bracket round (pour ordonner les duels)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS bracket_position INT;
