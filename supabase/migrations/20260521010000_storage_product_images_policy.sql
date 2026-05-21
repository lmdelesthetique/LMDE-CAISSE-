-- ============================================================
-- STORAGE: product-images bucket — RLS policies
-- The bucket exists and is public (reads work) but without
-- explicit INSERT/UPDATE policies, authenticated users cannot
-- upload. These policies fix that.
-- ============================================================

-- Ensure RLS is enabled on storage.objects (it should be by default)
-- These policies scope to the product-images bucket only.

CREATE POLICY "product_images_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "product_images_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'product-images')
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "product_images_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');

-- Public read (bucket is already public, but belt-and-suspenders)
CREATE POLICY "product_images_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'product-images');
