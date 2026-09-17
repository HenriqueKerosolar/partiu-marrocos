# Padrão de Desenvolvimento — Ecossistema KeroMind

Antes de escrever qualquer coisa nova, pergunte: **"isso já existe em algum projeto Kero\*?"**
Na maioria dos casos (auth, WhatsApp, CRM, conectores de banco), a resposta é sim — reaproveite em vez de reescrever.

## Stack base, sem exceção

- **Framework:** Next.js (App Router) + React + TypeScript
- **Estilo:** Tailwind + shadcn/ui
- **Banco:** PostgreSQL (Supabase) via Prisma ORM
- **Testes:** Vitest

## Checklist por tipo de tarefa

### Login / permissão de usuário
Copiar o padrão do **fabricaease**: `src/lib/jwt.ts`, `session.ts`, `rbac.ts`, `roles.ts`.
JWT em cookie httpOnly + RBAC + troca de senha forçada no primeiro acesso.
Não inventar esquema de auth novo. Nunca senha fixa no código (esse foi o erro crítico achado no Partiu Marrocos).

### Integração com WhatsApp
API oficial (WhatsApp Cloud API) — **não** Baileys/QR code (risco de banimento; os projetos da casa já estão migrando pra longe dele).
Referência: `KeroSolar CRM` (`cloud-api.ts`) ou `fabricaease` (`whatsapp/client.ts`, já valida assinatura HMAC do webhook).

### CRM / funil de lead / pipeline
Não desenhar schema do zero. Referência: modelo do **KeroSolar CRM** —
`Lead`, `Pipeline` + `Stage`, `Conversation`/`Message`, `Task`, `Note`.

### Integração com banco de dados de cliente (PDV/ERP)
Usar o pacote **`db-connector-base`** diretamente (SQL Server/MySQL/Postgres/Firebird já resolvidos).
Não reescrever conector — é regra da casa, tem skill dedicada pra isso.

### Chamadas de IA (chatbot, geração de texto, análise)
Não chamar a API do provedor direto no código da feature.
Passar pelo **Ai DEV Orquestrador** — já tem failover entre provedores (Anthropic/OpenAI/Gemini/OpenRouter) e um gate de aprovação/governança (Tool Broker).
Chamar IA direto = perder isso tudo e ter que reescrever a camada de segurança depois.

### Dinheiro
Sempre decimal, nunca float. Regra herdada do `CLAUDE.md` do MercadoEase.

### Data / hora
Armazenar sempre em UTC internamente, converter só na exibição.
Mesma regra do MercadoEase — e exigência explícita do documento do Partiu Marrocos.

### Mais de uma empresa/cliente no mesmo sistema
Multi-tenant desde o primeiro dia, mesmo que hoje só tenha um cliente — não vale escrever single-tenant e migrar depois.
Referência: padrão RLS do **MercadoEase** (`packages/db/tenant-db.ts`) ou hierarquia workspace/project do **Ai DEV Orquestrador**.

### Instalador desktop
Electron + electron-builder (NSIS), igual **CheckEase-Desktop** / **DataEase**.
Não montar packaging do zero — a skill `instalador-desktop` documenta o passo a passo.

## Onde cada padrão mora hoje (para copiar/consultar)

| Necessidade | Projeto de referência | Caminho |
|---|---|---|
| Auth + RBAC | fabricaease | `src/lib/jwt.ts`, `session.ts`, `rbac.ts`, `roles.ts` |
| WhatsApp Cloud API | KeroSolar CRM / fabricaease | `src/lib/crm/cloud-api.ts` / `src/lib/whatsapp/client.ts` |
| CRM / pipeline | KeroSolar CRM | `prisma/schema.prisma`, `src/lib/crm/` |
| Conector de banco | db-connector-base | `index.js`, `motores/*.js` |
| Orquestração de IA + governança | Ai DEV Orquestrador | `src/providers/router.ts`, `src/broker/toolBroker.ts` |
| Multi-tenant RLS | MercadoEase | `packages/db/src/tenant-db.ts`, `CLAUDE.md` |
| Instalador desktop | CheckEase-Desktop / DataEase | `electron-builder` config (NSIS) |
| Agendamento/booking | KeroIA Estética | modelo `Agendamento` |

## O que ainda não existe em nenhum projeto da casa (não copiar de lugar nenhum — construir do zero)

- Internacionalização real (idioma / moeda / fuso / país por mercado)
- Tradução e síntese de voz (ElevenLabs)
- Lead scoring / Next Best Action
- Motor fiscal multi-país (Country Packs)
