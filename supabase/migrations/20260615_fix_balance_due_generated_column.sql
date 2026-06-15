-- Fix balance_due generated column: subtract balance_paid so it goes to 0 when fully paid.
-- Previously: balance_due = total_amount - deposit_paid  (wrong — never reaches 0 after balance payment)
-- Correct:    balance_due = total_amount - deposit_paid - balance_paid

ALTER TABLE reservations DROP COLUMN balance_due;

ALTER TABLE reservations
  ADD COLUMN balance_due numeric(12,2) GENERATED ALWAYS AS
    (GREATEST(total_amount - COALESCE(deposit_paid, 0) - COALESCE(balance_paid, 0), 0))
  STORED;
