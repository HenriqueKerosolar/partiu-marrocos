-- RLS do Gate (T1), mesmo padrão fail-closed do resto do Tenant Core.
ALTER TABLE "gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "gates"
  USING (tenant_id = current_tenant_id() OR rls_bypass())
  WITH CHECK (tenant_id = current_tenant_id() OR rls_bypass());

-- Garante em nível de banco que nenhum Gate sai de PENDENTE sem um decisor
-- real (FK para users — estruturalmente só um humano, ver comentário no
-- schema.prisma). Equivalente ao CHECK `granted_by LIKE 'human:%'` do Ai DEV
-- Orquestrador (auditoria seção 5), adaptado pra usar integridade
-- referencial em vez de regex sobre string.
ALTER TABLE "gates" ADD CONSTRAINT "gates_decisao_exige_decisor"
  CHECK (status NOT IN ('APROVADO', 'REJEITADO', 'MODIFICADO') OR decisor_id IS NOT NULL);
