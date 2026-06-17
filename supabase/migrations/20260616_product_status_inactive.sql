-- 1. Expand check constraint to include inactive, coming_soon, archived
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_status_check;
ALTER TABLE products ADD CONSTRAINT products_product_status_check
  CHECK (product_status IN ('active', 'rupture', 'en_commande', 'suspendu', 'inactive', 'coming_soon', 'archived'));

-- 2. Expand status column constraint if it exists
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('active', 'rupture', 'en_commande', 'suspendu', 'inactive', 'coming_soon', 'archived'));

-- 3. Update trigger: do NOT override when product is intentionally inactive or coming_soon
CREATE OR REPLACE FUNCTION sync_product_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Preserve manually set statuses — only auto-sync active/rupture
  IF NEW.product_status IN ('inactive', 'coming_soon', 'archived', 'suspendu') THEN
    RETURN NEW;
  END IF;
  IF NEW.stock > 0 THEN
    NEW.status = 'active';
    NEW.product_status = 'active';
  ELSE
    NEW.status = 'rupture';
    NEW.product_status = 'rupture';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
