
CREATE POLICY "storage_read_signed_in" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('avatars','receipts','task-attachments'));
CREATE POLICY "storage_insert_signed_in" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','receipts','task-attachments') AND owner = auth.uid());
CREATE POLICY "storage_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
CREATE POLICY "storage_delete_own_or_finance" ON storage.objects FOR DELETE TO authenticated
  USING (owner = auth.uid() OR public.is_finance(auth.uid()));
