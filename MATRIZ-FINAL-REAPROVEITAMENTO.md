# Matriz Final de Reaproveitamento — C:\Projetos + CongáOne → Partiu Marrocos

Consolida 11 auditorias profundas (read-only, testes reais executados, evidência de código — nenhuma tratada como documentação). Detalhe completo de cada uma nos arquivos individuais em `scratchpad/AUDITORIA-*.md`.

## ⚠️ Achado que não é sobre reaproveitamento — é incidente de segurança

**KeroIA Estética** (`C:\Projetos\KeroIA Estética`): nenhum dos 18 arquivos de server actions valida sessão ou papel — inclusive abrir/fechar caixa, confirmar pagamento e configurar chave de API de IA. O middleware só confere se existe *um cookie qualquer*, sem validar o JWT. Tem também um fallback de secret JWT hardcoded (`'dev-secret-troque-em-producao'`). **Se esse sistema está em uso por algum cliente, isso é urgente e independente do projeto Partiu Marrocos.**

## Melhor candidato por camada

| Camada | Vencedor | Por quê | Ressalva séria |
|---|---|---|---|
| **Tenant Core (multi-tenant)** | **CongáOne** (`packages/db`) | RLS `FORCE`d, fail-closed, 7/7 testes negativos reais passando | Projeto tem 2-3 dias, zero commits, sem teste de concorrência |
| **Auth / RBAC** | **fabricaease** | Rate limit real, `mustChangePassword` em 2 camadas, 52/59 rotas protegidas | Gap fail-open em `isAdminPathAllowed` para páginas não mapeadas |
| **CRM / Pipeline / WhatsApp / Agente IA** | **KeroSolar CRM** | WhatsApp Cloud API real, anti-loop do agente é código real (não só prompt) | Zero multi-tenant, zero testes, HMAC do webhook efetivamente desligado (falta secret), 4 rotas sem auth |
| **Orquestração de IA / Governança** | **Ai DEV Orquestrador** | Router multi-provider + circuit breaker real. Isolamento multi-tenant por workspace: **20/20 testes reais, incluindo 9 testes de IDOR explícitos** (nunca cruzam workspace mesmo sabendo o ID real do alvo). Tool Broker aplica gate de verdade no único caminho real de execução | Suíte completa rodada de verdade: **3819/3833 passaram (99,66%), mas 13 falharam** — incluindo timeout/travamento no próprio motor Core, e o **fluxo de OAuth que alimentaria GA4/Google Ads/Meta Ads está genuinamente quebrado neste ambiente** (`SecretStorageError [windows_dpapi]`, causa raiz confirmada isolando o teste). "v1.0 CERTIFIED" foi cravada no 2º commit do projeto, sobre o motor Core antes de CRM/GA4/Ads existirem — defensável no escopo original, enganoso se usado hoje pra justificar confiança na plataforma de negócio inteira. WhatsApp/social 100% mockado |
| **Financeiro / Pagamentos** | **Nenhum vencedor claro** | fabricaease tem motor PIX genérico testado; MercadoEase (`legacy-checkease`) tem Mercado Pago real em produção | Tudo mono-moeda BRL / mono-país Brasil. Nenhum projeto tem noção de câmbio, moeda-base ou motor fiscal multi-país |
| **Conector de banco / Instalador desktop** | db-connector-base / CheckEase-Desktop | Validação somente-leitura comprovada por teste real (9/9) | **Sem relevância pro Partiu Marrocos hoje** — não force uso |

## Achado organizacional: duplicação de CRM ativa na casa

O **KeroSolar CRM** tem duas cópias divergentes confirmadas:
- **Pizzaria/keroIA-crm**: fork intencional de 27/06 que virou CRM de restaurante — divergência real e provavelmente válida, mas ainda usa Baileys (que o original já abandonou por instabilidade).
- **MultiCRM/sistemas/crm-solar**: cópia **não intencional e obsoleta** (~6 semanas atrás, ainda tem Baileys que o original removeu). Não usar essa cópia pra nada.

Isso não bloqueia o Partiu Marrocos, mas vale um alerta à parte: correções no KeroSolar CRM não estão se propagando pros forks.

## Matriz de classificação (resumo)

| Componente | Origem | Classificação | Ação recomendada |
|---|---|---|---|
| Tenant Core (RLS) | CongáOne | **C** — extrair como KeroModule | Adicionar teste de concorrência antes de declarar "oficial" |
| Auth/RBAC | fabricaease | **B/C** | Corrigir gap fail-open antes de portar |
| PIX (motor de pagamento) | fabricaease | **A** | Reutilizar direto — é o componente isolado de maior qualidade encontrado |
| CRM/Pipeline/WhatsApp/Agente IA | KeroSolar CRM | **B** | Ligar o HMAC (só falta configurar secret), adicionar multi-tenant, corrigir rotas sem auth |
| Router IA + Circuit Breaker | Ai DEV Orquestrador | **A/C** | Reutilizar — mas o Core tem 13 falhas reais na suíte completa (timeouts/EBUSY no Windows), investigar antes |
| Multi-tenant workspace + Tool Broker (governança) | Ai DEV Orquestrador | **A/C** | O achado mais sólido de toda a auditoria — 20/20 testes reais incluindo 9 IDOR explícitos. Reutilizar com confiança |
| Orquestradores de negócio (GA4/Ads/etc) | Ai DEV Orquestrador | **D/F** | Nunca validado contra conta real; fluxo de credenciamento OAuth está **quebrado agora** (DPAPI) — corrigir antes de confiar |
| Agendamento (booking) | KeroIA Estética | **D** | Só referência — modelo não mapeia pra reserva de viagem, e o projeto tem o incidente de segurança acima |
| Financeiro básico | Keroservice APP / MercadoEase legacy | **E/D** | Não portar — mono-moeda, sem câmbio, sem motor fiscal |
| Conectores de banco / instalador | db-connector-base, CheckEase-* | **F** (não priorizar agora) | Guardar para quando surgir necessidade real |

## O que isso significa pra fundação técnica do Partiu Marrocos

1. **Tenant Core**: portar o padrão RLS do CongáOne.
2. **Auth/RBAC**: portar o padrão do fabricaease, corrigindo o gap fail-open antes.
3. **CRM/WhatsApp/Agente IA**: portar do KeroSolar CRM, adicionando a camada multi-tenant que falta e ligando o HMAC.
4. **Orquestração de IA**: usar o router+circuit breaker do Ai DEV Orquestrador; não depender ainda dos orquestradores de GA4/Ads/etc (não comprovados).
5. **Financeiro multi-moeda/fiscal**: **desenvolvimento novo integral** — nada na casa serve de base real.
6. **i18n**: **desenvolvimento novo integral** — confirmado em todos os 11 projetos auditados, zero exceção.
