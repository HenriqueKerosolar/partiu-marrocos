# Travel Document Foundation 01 — Relatório de Fechamento

**Etapa 4 de 8 — PM-NIGHT-RUN-02 (COMANDO DE EXECUÇÃO CONTINUADA CONTROLADA)**
Executada sob autorização já concedida ("AUTORIZADA SE FINANCE = GREEN").

## Objetivo

Saber o que cada passageiro precisa entregar, o que já entregou, o que falta, validade, aprovação/rejeição e prazo — sem nunca armazenar um documento sensível de verdade nesta rodada (privacy-by-design).

## REQUISITO ≠ DOCUMENTO ENVIADO (§28)

`DocumentRequirement` — catálogo reusável por tenant (ex.: "Passaporte válido"), com `obrigatorio`/`ativo`. `TravelerDocument` — uma linha por passageiro × requisito, com status próprio. Desativar um requisito nunca apaga o histórico de quem já tinha uma linha criada — testado explicitamente: desativar "Visto" não remove o `TravelerDocument` já existente de um passageiro, só some da lista de requisitos ativos pra novos passageiros.

**Instanciação automática**: `adicionarTraveler` (Booking Foundation 01) agora também chama `sincronizarRequisitosDoTraveler`, que cria uma linha `PENDENTE` para cada requisito ativo do tenant — idempotente (chamar de novo nunca duplica), e cobre o caso de um requisito novo criado depois do passageiro já existir (só preenche o que falta).

## PRIVACY-BY-DESIGN — upload real é YELLOW (§29)

**Declaração explícita, sem ambiguidade**: `TravelerDocument` não tem nenhum campo de arquivo, URL ou caminho — só metadata/status (`status`, `enviadoEm`, `revisadoEm`, `revisadoPorId`, `motivoRejeicao`, `validadeAte`). Upload real de documento (foto do passaporte, PDF, etc.) **não foi implementado nesta rodada** — este ambiente de desenvolvimento não tem storage privado/autenticado com validação de MIME/tamanho/nomes internos aleatórios disponível, e o próprio comando autoriza esse fallback textualmente ("se storage seguro não puder ser garantido, implementar somente metadata/status e marcar upload como YELLOW"). Nenhum dado sensível (número de passaporte, imagem de documento) é coletado ou armazenado em nenhum lugar desta implementação.

## Status documental (§30)

6 estados cobertos: `PENDENTE/ENVIADO/EM_ANALISE/APROVADO/REJEITADO/EXPIRADO`. Máquina de estados real (`transicaoValidaDocumento`) — `EM_ANALISE` é uma etapa opcional (`ENVIADO` pode ir direto pra `APROVADO`/`REJEITADO`), `APROVADO` só sai pra `EXPIRADO` (nunca "desaprova" sem passar por vencimento), `REJEITADO`/`EXPIRADO` permitem reenvio. Rejeição grava `motivoRejeicao`; reenvio limpa o motivo antigo.

`statusDocumentalDoBooking` entrega o "estado documental agregado" pedido pelo comando — **puramente informativo**, nunca move o `Booking` sozinho ("não confirmar automaticamente viagem... salvo regra explícita" — nenhuma regra explícita foi pedida nesta rodada, então o Booking continua exigindo decisão humana pra `CONFIRMADA`, independente do estado documental).

## Prazos e alertas via Job Engine (§31)

Dois mecanismos, ambos reais e testados:
1. **`expirarDocumentosVencidos`** — sweep preguiçoso (mesmo padrão já estabelecido em Gates T1/Proposal — sem cron/worker dedicado, T5 não tem primitiva de agendamento recorrente). `APROVADO` com `validadeAte` vencida vira `EXPIRADO` na próxima leitura de `statusDocumentalDoBooking`.
2. **`travel_document.verificar_pendencias`** (Job Engine T5 real, registrado em `apps/web/src/lib/jobs/`) — mesmo padrão exato de `lead.repescar_elegibilidade`: reavalia pendências/vencimentos **na hora de rodar** (nunca confia na condição de quando foi agendado) e sinaliza via `Note` (tipo `PENDENCIA`) no Lead. **Nunca envia WhatsApp/mensagem externa sozinho** — testado ativamente: nenhuma `Message` é criada em nenhum cenário deste job. O sistema real de Notification fica pra Notifications Foundation (Etapa 7); este job só prepara o sinal interno, exatamente como pedido ("Criar Notification/Job quando apropriado").

## Migrations

1 nova, puramente aditiva (2 tabelas novas, nenhuma alteração em tabela existente):
```
20260915070000_travel_document_foundation_01          -- tabelas document_requirements + traveler_documents
20260915070100_enable_rls_travel_document_foundation_01  -- RLS
```
**39 migrations no total** (era 37 ao final da Etapa 3).

## RBAC

2 permissões novas: `documentos.view`/`documentos.manage`. Administrador e Vendas ganham ambas; Atendimento só visualiza.

## Segurança

- RLS testado em `DocumentRequirement` e `TravelerDocument` (isolamento multi-tenant real).
- `DOCUMENTO_STATUS_ALTERADO`/`DOCUMENTO_EXPIRADO` auditados (T1).
- Zero dado sensível armazenado — confirmado pela ausência estrutural de qualquer campo de arquivo no schema, não só por convenção de código.

## Testes novos (24)

- `packages/db/tests/unit/travel-document-transicoes.test.ts` — 7 (máquina de estados pura).
- `packages/db/tests/integration/travel-documents.test.ts` — 13 (catálogo, desativação preserva histórico, instanciação automática e idempotente, transições reais contra o banco, rejeição/reenvio, sweep de expiração, agregado do booking, isolamento multi-tenant).
- `apps/web/tests/integration/job-travel-document-verificar.test.ts` — 4 (sinaliza pendência, sinaliza vencimento próximo, não sinaliza quando tudo ok, reavalia na hora de rodar — nunca envia mensagem em nenhum cenário).

## Regressão

**450/450 testes passando** (426 ao final da Etapa 3 + 24 novos). Typecheck limpo (`packages/db` e `apps/web`). Build limpo — 19 rotas (`/documentos` nova; `/leads/[id]` cresceu de 6.07kB pra 6.55kB — checklist documental por passageiro).

*Nota sobre uma corrida isolada*: durante uma execução do suite completo sob carga pesada momentânea da máquina, um teste de timing pré-existente e não relacionado (`tool-broker.test.ts`, T3, margem de 400ms contra um timeout declarado de 50ms) falhou por margem (429-480ms). Confirmado como flake ambiental — não uma regressão: passou de forma confiável em 3 execuções isoladas consecutivas, e nenhuma linha de código desta etapa toca o Tool Broker ou seu mecanismo de timeout/abort. A execução final e limpa (450/450) está registrada acima.

## Verificação ponta a ponta (navegador real)

1. `/documentos`: criado requisito "Passaporte válido" (obrigatório) — aparece na listagem.
2. Lead → proposta → aceita → reserva criada → passageiro "Maria Silva" adicionado → **checklist "Passaporte válido: Pendente" aparece automaticamente**, sem nenhuma ação manual de sincronização.
3. "marcar enviado" → status vira Enviado, ações mudam pra aprovar/rejeitar.
4. "aprovar" → status vira **Aprovado** de verdade, refletido no banco.

Zero erros de console em todo o fluxo. Dados de verificação removidos ao final.

## Limitações (honestas, não escondidas)

**Upload real de arquivo não existe** — este é o item mais importante desta seção, já sinalizado como YELLOW ao longo de todo o relatório, não uma descoberta tardia. Quando um storage seguro (privado, autenticado, validação de MIME/tamanho, nomes aleatórios, sem SVG, sem execução) estiver disponível, a extensão natural é adicionar uma referência opaca (`storageKey`) a `TravelerDocument` — o schema já foi desenhado pra comportar isso sem quebrar nada existente. Alertas de vencimento hoje geram uma `Note` interna, não uma notificação externa de verdade (WhatsApp/e-mail) — isso é Notifications Foundation (Etapa 7). Nenhuma regra determina automaticamente QUANDO agendar o job de verificação (isso dependeria de um agendamento recorrente que T5 não tem — mesma limitação estrutural já aceita em toda a fundação de Job Engine).

## Decisões do fundador pendentes

Nenhuma nova.

## Resultado / Status

**GREEN** — REQUISITO/DOCUMENTO ENVIADO separados corretamente, privacy-by-design real (não só declarada — estruturalmente impossível gravar arquivo no schema atual), 6 estados documentais com máquina de estados testada, estado agregado do Booking puramente informativo (nunca auto-confirma), Job Engine real usado pra prazos/pendências sem nunca enviar mensagem externa, 24/24 testes novos passando, regressão completa (450/450, com uma nota honesta sobre um flake ambiental pré-existente não relacionado), typecheck/build limpos, RLS/RBAC corretos, verificação ponta a ponta completa em navegador real.

## Próximo bloco

Etapa 5 — Trip Operation Foundation. **Prosseguindo automaticamente conforme autorização.**
