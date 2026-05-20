-- ============================================================
-- Seed products catalog for BeautyPOS
-- Populates the products table so reservation search works
-- ============================================================

DO $$
BEGIN
  -- Only insert if products table is empty
  IF NOT EXISTS (SELECT 1 FROM public.products LIMIT 1) THEN

    INSERT INTO public.products (ref, barcode, name, category, supplier, buy_price, transport, customs, other_fees, sell_price_ht, tva, min_stock, stock, status, reservable, sellable, shopify, has_color_variants, image_url)
    VALUES
      ('GEX-KIT-01',   '3701234500011', 'Kit Gel X Complet Débutante',          'Gel X',       'NailPro Shanghai',        24.50,  3.20,  1.80, 0, 59.87, 8.5, 8,  14, 'active',      true, true,  true,  false, NULL),
      ('LAMP-48W',     '3701234500022', 'Lampe UV/LED 48W Pro',                  'Machines',    'BeautyTech Guangzhou',    32.00,  8.50,  4.20, 0, 82.85, 8.5, 8,   6, 'active',      true, true,  true,  false, NULL),
      ('STR-200',      '3701234500033', 'Set Strass Dentaires 200pcs',           'Strass',      'Crystal Yiwu',             7.20,  1.10,  0.60, 0, 27.56, 8.5, 20, 43, 'active',      true, true,  true,  true,  NULL),
      ('CIL-B-CURL',   '3701234500044', 'Extension Cils Soie B-Curl',            'Cils',        'LashWorld Shenzhen',      14.80,  2.40,  1.30, 0, 51.52, 8.5, 10,  2, 'active',      true, true,  false, true,  NULL),
      ('SP-BOX-36',    '3701234500055', 'Semi-Permanent Color Box 36 teintes',   'Semi-perm.',  'ColorPro Paris',          34.00,  0,     0,    0, 78.25, 8.5, 12,  8, 'active',      true, true,  true,  false, NULL),
      ('TAB-MAN-LUX',  '3701234500066', 'Table de Manucure Pliante Luxe',        'Mobilier',    'FurniBeauty Foshan',      98.00, 42.00, 18.00, 0, 253.46,8.5,  5,  3, 'active',      true, true,  false, false, NULL),
      ('BROW-KIT-10',  '3701234500077', 'Brow Lift Kit Pro 10 poses',            'Brow Lift',   'BrowMaster Seoul',         9.20,  1.50,  0.80, 0, 32.17, 8.5, 15, 19, 'active',      true, true,  true,  false, NULL),
      ('ACR-RN-500',   '3701234500088', 'Poudre Acrylique Rose Nude 500g',       'Onglerie',    'NailPro Shanghai',         7.80,  1.20,  0.50, 0, 20.28, 8.5, 15, 22, 'active',      true, true,  true,  true,  NULL),
      ('KIT-DEB-ONG',  '3701234500099', 'Kit Débutant Onglerie Complet',         'Kits',        'NailPro Shanghai',        52.00,  6.50,  3.20, 0, 109.68,8.5,  5,  7, 'active',      true, true,  true,  false, NULL),
      ('FRAISE-35K',   '3701234500100', 'Fraise Électrique 35 000 RPM',          'Machines',    'BeautyTech Guangzhou',    18.50,  4.20,  2.10, 0, 44.70, 8.5,  8, 11, 'active',      true, true,  false, false, NULL),
      ('TC-GEL-15',    '3701234500111', 'Top Coat Gel Ultra Brillant 15ml',      'Gel X',       'ColorPro Paris',           4.20,  0,     0,    0, 11.89, 8.5, 25, 38, 'active',      true, true,  true,  false, NULL),
      ('COL-GX-7G',    '3701234500122', 'Colle Capsules Gel X Pro 7g',           'Gel X',       'NailPro Shanghai',         2.10,  0.40,  0.20, 0,  7.83, 8.5, 30, 55, 'active',      true, true,  true,  false, NULL),
      ('GLITTER-MIX',  '3701234500133', 'Glitter Mix Paillettes 12 couleurs',    'Onglerie',    'Crystal Yiwu',             3.50,  0.80,  0.40, 0, 10.60, 8.5, 20,  0, 'rupture',     true, true,  false, true,  NULL),
      ('CHAIR-PRO-WH', '3701234500144', 'Siège Client Confort Pro Blanc',        'Mobilier',    'FurniBeauty Foshan',     145.00, 68.00, 28.00, 0, 414.75,8.5,  2,  0, 'coming_soon', true, false, false, true,  NULL);

  END IF;
END $$;
