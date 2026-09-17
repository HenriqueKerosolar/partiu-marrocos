# Trip Operation Foundation 01 — Relatório de Fechamento

**Etapa 5 de 8 — PM-NIGHT-RUN-02 (COMANDO DE EXECUÇÃO CONTINUADA CONTROLADA)**
Executada sob autorização já concedida ("AUTORIZADA SE TRAVEL DOCUMENT = GREEN").

## Objetivo

Separar a **operação da viagem** (itinerário, checklist operacional, execução no terreno) da **reserva comercial** (Booking), sem presumir que uma Trip corresponde a um único Booking — o comando pede explicitamente para não presumir 1:1 sem avaliar.

## BOOKING ≠ TRIP/OPERAÇÃO (§35)

`Booking` continua representando a reserva comercial (preço, status comercial, pagamentos, comissões — Etapas 1-3). `Trip` é uma entidade nova, própria, que representa a execução operacional de uma viagem real (roteiro, mercado, datas, timezone, responsável operacional, status operacional próprio). Nenhum campo comercial foi duplicado em `Trip` — quem quiser saber o preço de uma reserva vinculada continua lendo `Booking.preco`, nunca um campo espelhado em `Trip`.

## Trip ↔ Booking é 1:N, nunca presumido 1:1 (§36)

Decisão arquitetural central desta etapa: `Booking.tripId` é uma FK nullable simples (Trip é o lado "1", Booking o lado "N"), não um relacionamento 1:1 nem uma tabela de junção. Isso permite que múltiplas reservas de leads diferentes (ou do mesmo lead) compartilhem a mesma execução operacional — cenário real de turismo em grupo/saída fixa, onde várias famílias compram passagens separadas para a mesma viagem operada.

**Provado, não só declarado**: teste de integração dedicado (`trip.test.ts`) cria dois Bookings diferentes do mesmo lead e vincula ambos à mesma Trip sem conflito nenhum — a segunda vinculação não sobrescreve nem rejeita a primeira. Desvincular (`desvincularBookingDaTrip`) limpa `tripId` sem apagar o Booking; um Booking também pode legitimamente nunca ter Trip nenhuma (reserva sem operação ainda planejada).

## Máquina de estados da Trip (§37)

5 estados: `PLANEJAMENTO → CONFIRMADA → EM_ANDAMENTO → CONCLUIDA`, com `CANCELADA` acessível de `PLANEJAMENTO`/`CONFIRMADA`. Mesma regra já aplicada em Booking: uma viagem `EM_ANDAMENTO` não cancela sozinha (exceção operacional fica fora desta fundação, mesma decisão já tomada para Booking na Etapa 1) — testado explicitamente em `trip-transicoes.test.ts`. Transição inválida é rejeitada tanto na tabela pura quanto contra o banco real.

## Itinerário e checklist genéricos, sem hardcode de Marrocos (§38)

`TripItineraryDay` (um dia, com número sequencial único por Trip — duplicar `numeroDia` é rejeitado) e `TripActivity` (atividade dentro de um dia: nome, local, horário como texto livre, instruções, visibilidade ao viajante, referência textual de fornecedor). `TripChecklistItem` cobre 8 categorias operacionais genéricas (`DOCUMENTOS/PAGAMENTO/FORNECEDORES/TRANSPORTE/HOSPEDAGEM/ATIVIDADES/TRANSFER/OUTRO`) — nada no motor assume Marrocos, roteiros específicos ou fornecedores fixos; todo conteúdo real (destino, atividades, fornecedores) é dado inserido pelo usuário, não lógica do código.

`TripActivity.visivelParaViajante` (default `true`) distingue atividades visíveis ao cliente final (relevante para a futura Traveler Area, Etapa 6) de itens puramente internos (ex.: "confirmar pagamento do fornecedor de transfer") — verificado em navegador real com uma atividade de cada tipo.

## Migrations

1 nova, puramente aditiva (4 tabelas novas + 1 coluna nullable em tabela existente):
```
20260915080000_trip_operation_foundation_01          -- trips, trip_itinerary_days, trip_activities, trip_checklist_items + bookings.trip_id
20260915080100_enable_rls_trip_operation_foundation_01  -- RLS
```
**41 migrations no total** (era 39 ao final da Etapa 4).

## RBAC

2 permissões novas: `trips.view`/`trips.manage`. Administrador e Vendas ganham ambas; Atendimento só visualiza.

## Segurança

- RLS testado em `Trip`, `TripItineraryDay`, `TripActivity`, `TripChecklistItem` (isolamento multi-tenant real) — inclusive o caso específico de FK composta: Tenant B não consegue vincular um Booking seu a uma Trip do Tenant A, porque a constraint `[tenantId, tripId] → [tenantId, id]` torna essa combinação estruturalmente inexistente para outro tenant, não apenas bloqueada por policy.
- `TRIP_CRIADA/TRIP_STATUS_ALTERADO/BOOKING_VINCULADO_TRIP/BOOKING_DESVINCULADO_TRIP` auditados (T1).
- Nenhum dado sensível novo — Trip/itinerário/checklist são puramente operacionais.

## Testes novos (18)

- `packages/db/tests/unit/trip-transicoes.test.ts` — 6 (máquina de estados pura, incluindo "viagem em andamento não cancela sozinha").
- `packages/db/tests/integration/trip.test.ts` — 12 (criação, transições válidas/inválidas contra o banco, **prova do 1:N** com dois Bookings na mesma Trip, desvincular preserva o Booking, Booking sem Trip é válido, criação de dia/atividade, rejeição de dia duplicado, atividade interna vs. visível ao viajante, criação/toggle de checklist, isolamento multi-tenant).

## Regressão

**364/364 testes passando** no pacote `db` (346 ao final da Etapa 4 + 18 novos). Typecheck limpo (`packages/db` e `apps/web`). Build limpo — 21 rotas (`/viagens` e `/viagens/[id]` novas; `/leads/[id]` cresceu para 7.2kB com o componente de vínculo à Trip).

## Verificação ponta a ponta (navegador real)

1. `/viagens`: estado vazio renderiza corretamente; link "Viagens" visível no menu, condicionado a `trips.view`.
2. Criada Trip "Marraquexe + Deserto, 8 dias" (09/11/2026 – 17/11/2026, timezone Africa/Casablanca) via formulário — redireciona para o detalhe.
3. Adicionado Dia 1 (09/11/2026, "Chegada em Marraquexe") — aparece na lista do itinerário.
4. Adicionadas duas atividades ao Dia 1: uma visível ao viajante ("Check-in no riad") e uma interna ("Confirmar pagamento do fornecedor de transfer", sem marcar "visível ao viajante") — a segunda renderiza corretamente com o rótulo **"interno"**.
5. Adicionado item de checklist ("Conferir passaportes válidos de todos os passageiros", categoria DOCUMENTOS) — contador vai de 0/1 para 1/1 ao marcar como concluído, e o estado persiste após reload.
6. Clicado "Confirmada" no card de status — badge atualiza e o conjunto de botões passa a oferecer "Em andamento"/"Cancelada", refletindo corretamente as transições válidas a partir de `CONFIRMADA`.
7. Fluxo completo Lead → Proposta (criada, enviada, aceita) → Booking criado → vínculo Booking↔Trip testado a partir da página do lead: dropdown de `TripLink` listou a Trip criada, "Vincular" funcionou, o card do Booking passou a mostrar "Viagem: Marraquexe + Deserto, 8 dias" com opção de desvincular, e a página da Trip atualizou "Reservas vinculadas" de 0 para 1, mostrando corretamente 0 passageiros e o valor da reserva.

Zero erros de console em todo o fluxo. Dados de verificação (Trip, itinerário, checklist, Booking, Proposal de teste) removidos ao final via script descartável, com bypass de RLS explícito (`withSystem`) — a tentativa inicial de limpeza sem esse bypass confirmou, na prática, que a RLS fail-closed também protege contra scripts administrativos descuidados, não só contra requests de outro tenant.

## Limitações (honestas, não escondidas)

Horário de atividade (`horaInicio`/`horaFim`) é texto livre, não `DateTime` — decisão deliberada para evitar complexidade de fuso horário não pedida pelo comando, já que `TripItineraryDay.data` já ancora a data real do dia. Não existe nenhuma tela de "roteiro público" formatado para o cliente final — isso é Traveler Area (Etapa 6), que também é o consumidor natural de `visivelParaViajante`. `TripActivity.fornecedorReferencia` é só um campo de texto livre, sem vínculo com uma entidade de fornecedor real (Supplier Engine está fora do escopo desta rodada, explicitamente proibido no comando).

## Decisões do fundador pendentes

Nenhuma nova.

## Resultado / Status

**GREEN** — Trip é uma entidade operacional própria, genuinamente distinta de Booking; relação 1:N com Booking implementada e **provada** (não presumida) com teste dedicado; máquina de estados testada incluindo a regra de não-cancelamento durante execução; itinerário/checklist genéricos, sem qualquer hardcode de Marrocos ou de fornecedor específico; 18/18 testes novos passando; regressão completa (364/364); typecheck/build limpos; RLS (inclusive via FK composta) e RBAC corretos; verificação ponta a ponta completa em navegador real, incluindo o fluxo integral Lead→Proposta→Booking→vínculo com Trip.

## Próximo bloco

Etapa 6 — Traveler Area V1. **Prosseguindo automaticamente conforme autorização.**
