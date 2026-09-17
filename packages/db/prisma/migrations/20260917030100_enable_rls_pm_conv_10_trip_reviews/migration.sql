ALTER TABLE "trip_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trip_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trip_reviews"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());
