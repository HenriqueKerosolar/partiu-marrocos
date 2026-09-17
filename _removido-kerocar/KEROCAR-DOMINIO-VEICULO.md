# KeroCar — Domínio de Telemetria/Diagnóstico Veicular

**Documento de estado real, escrito depois da implementação** — não é um
plano prévio nem um deliverable formal pré-definido. Registra o que existe
de fato neste repositório hoje: schema, rotas, telas, testes, o que foi
verificado ao vivo e o que ainda falta. Serve de insumo para a decisão de
fronteira Partiu/KeroCar que o `PLANO-MESTRE-EXECUCAO.md` (seções L/M) já
sinalizou como pendente — não substitui nem antecipa essa decisão, que
continua sendo de quem tem a visão de negócio do KeroCar.

## Por que este domínio está neste repositório

Este repo nasceu como a fundação técnica do Partiu Marrocos (CRM de turismo).
Durante uma auditoria de reaproveitamento entre projetos da casa, o domínio
de telemetria veicular do KeroCar foi construído aqui por decisão explícita
de "aproveitar o Tenant Core já pronto (RLS + FK composta) em vez de montar
um multi-tenant novo do zero" — não por decisão de que Partiu e KeroCar são
o mesmo produto. Os dois domínios não têm nenhuma FK cruzada entre si; o que
compartilham é infraestrutura (`schema.prisma`, `permissions.ts`,
`apps/web/src/app/(app)/layout.tsx`), não lógica de negócio.

## O que existe

### Schema (`packages/db/prisma/schema.prisma`)

| Model | Uso | Tem rota/tela? |
|---|---|---|
| `Device` | Tracker físico (fabricante/modelo/serial/IMEI/revisões, chave de API própria, status) | Sim — provisionar, editar dados, mudar status, rotacionar chave |
| `Vehicle` | Veículo (placa/marca/modelo/ano/motorização/VIN) | Sim — listar, ver detalhe, editar |
| `TelemetryEvent` | Posição/velocidade/ignição/odômetro/RPM/temperatura, payload bruto preservado | Sim — ingestão via API key de device, listagem no detalhe do veículo |
| `DtcEvent` | Código de falha (DTC), status, MIL, freeze frame | Sim — ingestão + listagem |
| `SecurityEvent` | Impacto/tamper/geofence/motorista desconhecido | **Só schema + RLS. Nenhuma rota, nenhuma tela, nenhum teste.** |
| `MaintenanceRecord` | Histórico de manutenção (odômetro, tipo de serviço, custo) | **Só schema + RLS. Nenhuma rota, nenhuma tela, nenhum teste.** |

Todos os models seguem o padrão do Tenant Core já validado no Partiu:
`tenantId` em toda linha, `@@unique([tenantId, id])` como alvo de FK
composta (nunca uma FK simples para outra tabela tenant-scoped — Postgres
não aplica RLS da tabela referenciada ao validar uma FK comum), RLS
`FORCE`-ada com fail-closed via `current_tenant_id()`/`rls_bypass()`.

### Autenticação de dispositivo (`packages/db/src/device-auth.ts`)

Mecanismo M2M separado do login de usuário: token `"<deviceId>.<segredo>"`,
segredo de 32 bytes aleatórios, nunca guardado em texto plano — só o hash
bcrypt em `Device.apiKeyHash`. `resolveDeviceFromApiKey` faz uma busca
cross-tenant deliberada (`withSystem`) só pelo `deviceId` explícito do
token — mesma lógica estrutural do login resolver um usuário por e-mail
antes de haver tenant selecionado. Device `INATIVO`/`MANUTENCAO` ou sem
`apiKeyHash` nunca autentica. `rotateDeviceApiKey` reemite e invalida a
chave anterior atomicamente.

### Vehicle Device Gateway (`packages/db/src/vehicle-gateway.ts`)

Ponto único de entrada para dado de qualquer tracker de terceiro — nenhuma
rota ou lógica de negócio depende diretamente do protocolo de um
fabricante. Um `VehicleDeviceAdapter` converte o payload proprietário para
`NormalizedTelemetryEvent`/`NormalizedDtcEvent`; o dado bruto é sempre
preservado em `rawPayload` para reprocessamento futuro. Hoje só existe
`genericJsonAdapter` — um decoder de referência para JSON simples
(`{lat, lng, speed, ignition, ...}`), **não é o decoder binário real de
nenhum protocolo de tracker específico** (ex. Codec8/Codec8E da Teltonika).
Prova o pipeline ponta a ponta; não substitui a integração de um tracker
físico real.

### API

| Rota | Método | Autenticação | Descrição |
|---|---|---|---|
| `/api/vehicle/telemetry` | POST | API key de device (Bearer) | Ingestão de telemetria |
| `/api/vehicle/dtc` | POST | API key de device (Bearer) | Ingestão de DTC |
| `/api/frota/dispositivos` | POST | Sessão + `frota.manage` | Provisiona veículo + device, retorna API key uma única vez |
| `/api/frota/dispositivos/[id]` | PATCH | Sessão + `frota.manage` | Edita fabricante/modelo/serial/IMEI/revisões |
| `/api/frota/dispositivos/[id]/status` | PATCH | Sessão + `frota.manage` | Muda status (bloqueia autenticação do device na hora) |
| `/api/frota/dispositivos/[id]/rotacionar` | POST | Sessão + `frota.manage` | Reemite a API key |
| `/api/frota/veiculos/[id]` | PATCH | Sessão + `frota.manage` | Edita placa/marca/modelo/ano |

As rotas `/api/vehicle/*` são autenticadas por Bearer token de device, não
por cookie de sessão — o middleware global (`apps/web/src/middleware.ts`)
tem exceção explícita para esse prefixo (achado real desta implementação:
ver seção "Bug real encontrado" abaixo).

### Telas (`apps/web/src/app/(app)/frota/`)

- `/frota` — lista de veículos do tenant, com dispositivo ativo, última
  telemetria e contagem de DTCs ativos.
- `/frota/novo` — provisionamento (cria veículo + device, mostra a API key
  uma única vez).
- `/frota/[id]` — detalhe: dispositivos vinculados (editar dados, mudar
  status, rotacionar chave), histórico de DTC, últimas posições de
  telemetria, edição de dados do veículo.

### Permissões

`frota.view` (ver) e `frota.manage` (gerenciar) — catálogo global em
`packages/db/src/permissions.ts`, herdadas automaticamente pelo papel
Administrador via `ALL_PERMISSION_KEYS`. Nenhum outro papel padrão do
Partiu (Vendas, Atendimento) tem acesso à frota por padrão.

### Testes

87 testes automatizados nesta fatia, todos passando, typecheck limpo:

- `packages/db` (50): normalização de payload (`vehicle-gateway.test.ts`),
  isolamento RLS negativo do domínio veículo
  (`kerocar-vehicle-isolation.test.ts`), ingestão real contra Postgres
  (`vehicle-gateway-ingest.test.ts`), autenticação de device
  (`device-auth.test.ts`).
- `apps/web` (37): rotas de telemetria/DTC (autenticação por API key,
  rejeição de payload inválido), provisionamento, rotação de chave, status
  de device, edição de veículo, edição de device — cobrindo
  401/403/400/404/409/RLS por permissão, existência e tenant em cada rota.

### Verificado visualmente (não só automatizado)

Cada funcionalidade da UI foi confirmada rodando de verdade contra um
servidor Next.js real e Postgres real (cópia isolada do repositório,
nunca no servidor de desenvolvimento principal), incluindo reload completo
da página para confirmar persistência no servidor — não só estado local do
React: provisionamento → API key mostrada uma vez → ingestão real via
`curl` → dado aparecendo na tela; rotação de chave invalidando a anterior;
mudança de status; edição de veículo; edição de device.

### Bug real encontrado e corrigido nessa verificação

O middleware global de sessão bloqueava com 401 qualquer chamada a
`/api/vehicle/*` sem cookie — quebraria a ingestão real, já que quem chama
essas rotas é um dispositivo físico autenticado por API key, nunca um
navegador logado. Só apareceu testando via HTTP real contra o servidor
rodando — os testes automatizados chamam o handler da rota diretamente,
o que nunca passa pelo middleware. Corrigido isentando `/api/vehicle/` da
checagem de sessão (a rota continua exigindo autenticação — a própria, por
Bearer token).

## O que ainda falta

- **`SecurityEvent` e `MaintenanceRecord` são só schema.** Têm RLS
  habilitada e migration aplicada, mas zero rota, zero tela, zero teste —
  não ingerem nem exibem nada hoje. Não remover do schema sem decisão
  explícita (pode já ter sido pensado como próximo passo por quem desenhou
  o domínio originalmente); só documentando que não estão implementados.
- **Nenhum tracker físico real foi integrado.** `genericJsonAdapter` é só
  um formato de referência para provar o pipeline — decodificar o
  protocolo binário real de um fabricante específico (Codec8/Codec8E da
  Teltonika, por exemplo) é trabalho novo, não feito aqui.
- **Editar dados do device não inclui `hwRevision`/`fwRevision`** na UI
  (a rota aceita, o formulário não expõe esses dois campos — só
  fabricante/modelo/serial/IMEI).

## Fronteira Partiu/KeroCar — questão em aberto (não decidida aqui)

O `PLANO-MESTRE-EXECUCAO.md` (seções L e M) já registrou como bloqueador
de homologação que Partiu e KeroCar compartilham um único
`schema.prisma`, um único `permissions.ts` e um único layout de app —
compartilhamento de infraestrutura, não acoplamento de domínio (nenhuma FK
cruzada, nenhuma rota de um domínio chama lógica do outro), mas um risco
de monólito acidental que cresce com o número de domínios adicionados ao
mesmo repositório. A fronteira proposta lá (Shared Platform Core / Partiu
Domain / KeroCar Domain, cada um potencialmente um `schema.prisma` parcial
ou schema Postgres separado no futuro) não foi implementada — decisão de
infraestrutura que depende de quando (se) os dois produtos precisarem
escalar times ou deploys de forma independente. Este documento não decide
isso; só deixa registrado, com o estado real e testado do lado KeroCar,
para quem for tomar essa decisão.
