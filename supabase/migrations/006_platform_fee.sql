ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS platform_fee_cents INT NOT NULL DEFAULT 0;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS fee_collected BOOLEAN NOT NULL DEFAULT false;
