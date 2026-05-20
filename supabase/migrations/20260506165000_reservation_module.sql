-- ============================================================
-- Reservation Module
-- ============================================================

-- 1. ENUM Types
DROP TYPE IF EXISTS public.reservation_status CASCADE;
CREATE TYPE public.reservation_status AS ENUM ('pending', 'deposit_paid', 'ready', 'completed', 'cancelled');

DROP TYPE IF EXISTS public.reservation_payment_method CASCADE;
CREATE TYPE public.reservation_payment_method AS ENUM ('cash', 'card', 'transfer', 'cheque');

-- 2. Core Table
CREATE TABLE IF NOT EXISTS public.reservations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_number  TEXT NOT NULL UNIQUE,
    client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name         TEXT NOT NULL,
    client_phone        TEXT,
    client_email        TEXT,
    items               JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
    deposit_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    deposit_paid        NUMERIC(10,2) NOT NULL DEFAULT 0,
    balance_due         NUMERIC(10,2) GENERATED ALWAYS AS (total_amount - deposit_paid) STORED,
    reservation_status  public.reservation_status NOT NULL DEFAULT 'pending'::public.reservation_status,
    deposit_payment_method public.reservation_payment_method,
    deposit_paid_at     TIMESTAMPTZ,
    ready_at            TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,
    notes               TEXT,
    pickup_date         DATE,
    cashier_name        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(reservation_status);
CREATE INDEX IF NOT EXISTS idx_reservations_client_id ON public.reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON public.reservations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_number ON public.reservations(reservation_number);

-- 4. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_reservations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 5. Enable RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (open access — same pattern as other modules in this app)
DROP POLICY IF EXISTS "reservations_open_access" ON public.reservations;
CREATE POLICY "reservations_open_access"
ON public.reservations
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 7. Trigger
DROP TRIGGER IF EXISTS trg_reservations_updated_at ON public.reservations;
CREATE TRIGGER trg_reservations_updated_at
BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.update_reservations_updated_at();

-- 8. Mock Data
DO $$
DECLARE
    client_id_1 UUID;
    client_id_2 UUID;
BEGIN
    -- Try to get existing client IDs
    SELECT id INTO client_id_1 FROM public.clients ORDER BY created_at LIMIT 1;
    SELECT id INTO client_id_2 FROM public.clients ORDER BY created_at OFFSET 1 LIMIT 1;

    INSERT INTO public.reservations (
        id, reservation_number, client_id, client_name, client_phone, client_email,
        items, total_amount, deposit_amount, deposit_paid,
        reservation_status, deposit_payment_method, deposit_paid_at,
        pickup_date, cashier_name, notes
    ) VALUES
    (
        gen_random_uuid(), 'RES-2026-001',
        client_id_1, COALESCE((SELECT first_name || ' ' || last_name FROM public.clients WHERE id = client_id_1), 'Amina Benali'),
        '06 12 34 56 78', 'amina.benali@email.com',
        '[{"name":"Fond de teint Lancôme","qty":1,"price":52.00,"sku":"LNC-FDT-01"},{"name":"Rouge à lèvres Chanel","qty":2,"price":38.00,"sku":"CHL-RAL-05"}]'::jsonb,
        128.00, 50.00, 50.00,
        'deposit_paid'::public.reservation_status, 'card'::public.reservation_payment_method, now() - interval '2 days',
        CURRENT_DATE + interval '5 days', 'Sophie Fontaine', 'Cliente fidèle, préférence emballage cadeau'
    ),
    (
        gen_random_uuid(), 'RES-2026-002',
        client_id_2, COALESCE((SELECT first_name || ' ' || last_name FROM public.clients WHERE id = client_id_2), 'Fatima Oukili'),
        '06 98 76 54 32', 'fatima.oukili@email.com',
        '[{"name":"Palette ombres Urban Decay","qty":1,"price":65.00,"sku":"UD-PAL-12"},{"name":"Mascara Dior","qty":1,"price":34.00,"sku":"DIO-MAS-03"}]'::jsonb,
        99.00, 30.00, 0.00,
        'pending'::public.reservation_status, NULL, NULL,
        CURRENT_DATE + interval '3 days', 'Sophie Fontaine', NULL
    ),
    (
        gen_random_uuid(), 'RES-2026-003',
        NULL, 'Nadia Cherif',
        '07 11 22 33 44', NULL,
        '[{"name":"Crème hydratante Clarins","qty":2,"price":45.00,"sku":"CLR-CRM-07"}]'::jsonb,
        90.00, 45.00, 45.00,
        'ready'::public.reservation_status, 'cash'::public.reservation_payment_method, now() - interval '1 day',
        CURRENT_DATE + interval '1 day', 'Marie Dupont', 'Appeler avant mise de côté'
    ),
    (
        gen_random_uuid(), 'RES-2026-004',
        NULL, 'Leila Mansouri',
        '06 55 44 33 22', 'leila.m@email.com',
        '[{"name":"Parfum Yves Saint Laurent","qty":1,"price":120.00,"sku":"YSL-PRF-02"}]'::jsonb,
        120.00, 60.00, 60.00,
        'completed'::public.reservation_status, 'card'::public.reservation_payment_method, now() - interval '5 days',
        CURRENT_DATE - interval '1 day', 'Sophie Fontaine', NULL
    ),
    (
        gen_random_uuid(), 'RES-2026-005',
        NULL, 'Sara Bouzid',
        '06 77 88 99 00', NULL,
        '[{"name":"Kit soin visage Nuxe","qty":1,"price":78.00,"sku":"NXE-KIT-04"},{"name":"Huile prodigieuse Nuxe","qty":1,"price":29.00,"sku":"NXE-HLE-01"}]'::jsonb,
        107.00, 40.00, 0.00,
        'pending'::public.reservation_status, NULL, NULL,
        CURRENT_DATE + interval '7 days', 'Marie Dupont', 'Commande spéciale'
    )
    ON CONFLICT (reservation_number) DO NOTHING;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Mock data insertion failed: %', SQLERRM;
END $$;
