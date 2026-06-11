import { NextResponse } from 'next/server';

const TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION sync_product_status()
RETURNS TRIGGER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trigger_sync_product_status ON products;

CREATE TRIGGER trigger_sync_product_status
BEFORE UPDATE ON products
FOR EACH ROW
WHEN (OLD.stock IS DISTINCT FROM NEW.stock)
EXECUTE FUNCTION sync_product_status();
`.trim();

export async function GET() {
  return NextResponse.json({
    sql: TRIGGER_SQL,
    instructions: 'Copiez ce SQL et exécutez-le dans Supabase → SQL Editor',
  });
}
