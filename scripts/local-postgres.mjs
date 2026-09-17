#!/usr/bin/env node
// Alternativa ao docker-compose.yml para ambientes onde o Docker Desktop não
// sobe. Sobe um Postgres real (não emulado) via `embedded-postgres` — os
// binários vêm do Maven Central (zonky/embedded-postgres-binaries), não do
// instalador oficial da EnterpriseDB.
//
// Cria a mesma role `partiumarrocos_app` (dona do schema, sem bypass de RLS)
// que o docker/postgres-init/01-roles.sql criaria — mesma credencial que
// DATABASE_URL em .env já espera. Mesmo padrão do CongáOne.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(__dirname, "..", ".pgdata");
// Porta diferente do CongáOne (5433) para os dois poderem rodar ao mesmo
// tempo em dev sem conflito.
const PORT = 5434;
const BOOTSTRAP_USER = "postgres";
const BOOTSTRAP_PASSWORD = "postgres_bootstrap_only";
const APP_DB = "partiumarrocos";
const APP_ROLE = "partiumarrocos_app";
const APP_ROLE_PASSWORD = "partiumarrocos_app_pw";

const pg = new EmbeddedPostgres({
  databaseDir,
  user: BOOTSTRAP_USER,
  password: BOOTSTRAP_PASSWORD,
  port: PORT,
  persistent: true,
});

async function ensureAppRoleAndDatabase() {
  const admin = pg.getPgClient("postgres");
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    if (rowCount === 0) {
      await admin.query(
        `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_ROLE_PASSWORD}' NOSUPERUSER CREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
      console.log(`Role ${APP_ROLE} criada.`);
    } else {
      await admin.query(`ALTER ROLE ${APP_ROLE} CREATEDB`);
    }

    const dbExists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [APP_DB]);
    if (dbExists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${APP_DB}`);
      console.log(`Database ${APP_DB} criado.`);
    }

    await admin.query(`ALTER DATABASE ${APP_DB} OWNER TO ${APP_ROLE}`);
  } finally {
    await admin.end();
  }

  const appDb = pg.getPgClient(APP_DB);
  await appDb.connect();
  try {
    await appDb.query(`GRANT ALL ON SCHEMA public TO ${APP_ROLE}`);
  } finally {
    await appDb.end();
  }
}

async function start() {
  const alreadyInitialised = existsSync(path.join(databaseDir, "PG_VERSION"));
  if (!alreadyInitialised) {
    console.log("Inicializando cluster Postgres em", databaseDir, "...");
    await pg.initialise();
  }

  await pg.start();
  console.log(`Postgres rodando em localhost:${PORT}.`);

  await ensureAppRoleAndDatabase();
  console.log(`Role/${APP_ROLE} e database/${APP_DB} prontos.`);
  console.log("Pressione Ctrl+C (ou pare esta tarefa) para desligar.");

  const shutdown = async () => {
    console.log("Desligando Postgres...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

async function stop() {
  await pg.stop();
  console.log("Postgres desligado.");
}

const command = process.argv[2];
if (command === "start") {
  await start();
} else if (command === "stop") {
  await stop();
} else {
  console.error("Uso: node scripts/local-postgres.mjs <start|stop>");
  process.exit(1);
}
