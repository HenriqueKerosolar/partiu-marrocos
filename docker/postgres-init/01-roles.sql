-- Roda como o superuser de bootstrap da imagem (POSTGRES_USER=postgres, ver
-- docker-compose.yml) — usado só para provisionar a role da aplicação, nunca
-- para migrations/runtime.
--
-- Uma única role de aplicação, dona do banco/schema, SEM bypass de RLS. É a
-- mesma role para migrations e para runtime (mesmo padrão do CongáOne/
-- MercadoEase) — o isolamento por tenant não depende de privilégio de role,
-- depende da policy `tenant_isolation` (ver packages/db/prisma/rls.sql) mais
-- o par current_tenant_id()/rls_bypass(). FORCE ROW LEVEL SECURITY garante
-- que a policy vale mesmo para esta role sendo dona das tabelas.
-- CREATEDB é só para o shadow database do `prisma migrate dev` (dev only —
-- `prisma migrate deploy`, usado em produção, não cria shadow database e não
-- precisaria desse privilégio).
CREATE ROLE partiumarrocos_app LOGIN PASSWORD 'partiumarrocos_app_pw' NOSUPERUSER CREATEDB NOCREATEROLE NOBYPASSRLS;

ALTER DATABASE partiumarrocos OWNER TO partiumarrocos_app;
GRANT ALL ON SCHEMA public TO partiumarrocos_app;
