CREATE POLICY "productos_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'productos');
CREATE POLICY "productos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'productos');
CREATE POLICY "productos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'productos');
CREATE POLICY "productos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'productos');