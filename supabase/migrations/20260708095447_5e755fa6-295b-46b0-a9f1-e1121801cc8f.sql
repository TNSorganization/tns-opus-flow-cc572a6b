
CREATE POLICY "documents_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
CREATE POLICY "documents_insert_auth" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND auth.uid() = owner);
CREATE POLICY "documents_update_owner_or_admin" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (auth.uid() = owner OR public.has_role(auth.uid(),'administrator')));
CREATE POLICY "documents_delete_owner_or_admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (auth.uid() = owner OR public.has_role(auth.uid(),'administrator')));
