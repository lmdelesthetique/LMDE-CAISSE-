-- Delete fake demo inventory locations
DELETE FROM inventory_locations
WHERE name IN (
  'Boutique Principale',
  'Réserve Arrière',
  'Salon Espace Beauté'
);
