ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS players_per_team INT NOT NULL DEFAULT 2;
