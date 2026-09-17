# Perguntas em aberto — decisões pendentes

Depois de 3 auditorias profundas (CongáOne, KeroSolar CRM, Ai DEV Orquestrador) e da implementação já feita (WhatsApp, Yalla, Leads, captura pública de lead), ficaram decisões que só quem está do lado do negócio consegue responder — nenhuma delas é técnica pura. Organizado por prioridade, com recomendação onde faz sentido dar uma.

---

## 1. Ordem de extração dos KeroModules

A auditoria do Ai DEV Orquestrador achou 5 componentes maduros e testados que servem qualquer produto KeroMind, não só o Partiu: **Gates/Approval**, **Audit Log**, **Cost Control**, **Model Router**, **Job/Execution Engine**. Extrair todos de uma vez não faz sentido.

**Pergunta:** qual ordem? Minha leitura da própria auditoria (seção 26 — impacto no roadmap) aponta:

☐ Gates/Approval primeiro — é o mais maduro (49/49 testes) e resolve uma lacuna que **nenhum** produto da casa tem hoje (zero human-in-the-loop em produção)
☐ Audit Log junto com Gates — os dois se correlacionam (gate sem log de quem aprovou é decoração)
☐ Cost Control depois — só importa quando o Yalla estiver de fato gastando em volume
☐ Model Router e Job Engine por último — o Yalla hoje resolve com 1 provider + 1 retry; não é urgente
☐ Outra ordem — qual?

---

## 2. Yalla — vale investir em tool-calling agora?

Hoje o Yalla só responde texto. O Tool Broker do Ai DEV Orquestrador (232 testes passando) é uma arquitetura pronta pra isso, mas **nenhuma tool de negócio existe** — teria que construir do zero "mover lead de etapa", "consultar preço de pacote", "criar proposta" seguindo aquele padrão.

**Pergunta:** o Yalla precisa **agir** no CRM (mover lead, marcar tarefa) ou só **responder** mensagem por enquanto?

☐ Só responder por enquanto — tool-calling fica pra depois
☐ Já vale a pena — qual seria a primeira ação que o Yalla deveria conseguir fazer sozinho?

---

## 3. GA4 / Search Console / Google Ads / Meta Ads — validar contra conta real?

Toda a integração existe em código, nunca foi testada contra uma conta real (nem no Ai DEV, nem em nenhum outro projeto da casa). Execução de ações (pausar campanha, mudar orçamento) **não existe** em lugar nenhum — só leitura e recomendação.

**Pergunta:** existe uma conta de teste (GA4/Search Console/Google Ads/Meta) que eu possa usar pra validar isso de verdade antes de portar pro Partiu? Sem isso, fica tudo "no papel".

☐ Sim, tenho uma conta de teste — qual?
☐ Não agora — deixa pra quando o Partiu Marrocos tiver tráfego real pra medir

---

## 4. Atribuição de origem (UTM / gclid / fbclid) — prioridade?

Nenhum dos projetos da casa captura isso hoje. O algoritmo de atribuição do Ai DEV é correto, mas a base de eventos está vazia por design — sem captura, não tem o que atribuir.

**Pergunta:** vale adicionar captura de UTM/gclid/fbclid no endpoint público de lead (`/api/public/leads`) agora, enquanto ainda não tem tráfego pago rodando? É barato fazer agora e caro adicionar depois (perde histórico).

☐ Sim, adiciona agora
☐ Não, só quando começar a rodar Ads de verdade

---

## 5. Publicação social real (Instagram/Facebook) — construir?

Confirmado nos dois projetos (Ai DEV e o próprio Partiu original): só existe um "fake provider". Nenhuma API real de publicação foi integrada em lugar nenhum da casa ainda.

**Pergunta:** isso é parte do que a KeroMind promete vender (seção 9 do documento original do Partiu Marrocos — marketing/prospecção) ou pode ficar pra quando tiver um cliente pagando por isso especificamente?

☐ Prioridade — construir integração real
☐ Espera demanda de cliente

---

## 6. Bug DPAPI (auditoria anterior) — investigar mais?

A auditoria anterior relatou um `SecretStorageError [windows_dpapi]` real no fluxo OAuth do Ai DEV. Esta auditoria não conseguiu reproduzir nem encontrar evidência em log — mas também não descartou com certeza.

**Pergunta:** isso importa pro Partiu? O Secret Vault do Ai DEV é Windows-only (DPAPI) — não vai pra produção cloud sem trocar por KMS/Vault de qualquer forma. Vale investigar o bug específico, ou é descartável porque a arquitetura de secret vai ser refeita de qualquer jeito ao portar?

☐ Investigar mesmo assim
☐ Descartável — vai ser refeito de qualquer forma

---

## 7. Site público do Partiu Marrocos — quando integrar?

O backend já está pronto (`POST /api/public/leads`), resolvendo o bug crítico original (lead perdido ao abrir WhatsApp direto). Falta só trocar 2-3 linhas de JS no site estático (que só existe como ZIP, fora deste repositório) pra chamar esse endpoint antes de abrir o WhatsApp.

**Pergunta:** você tem acesso ao hospedeiro/repo real do site publicado, ou preciso pedir pra você subir o ZIP de novo aqui pra eu editar e te devolver?

☐ Mando o ZIP de novo pra você editar
☐ Tenho acesso direto, faço eu mesmo com as instruções que já estão no README

---

## 8. Multi-tenant do Ai DEV — portar pro Tenant Core do Partiu ou manter separado?

O Ai DEV é "multi-tenant lógico" (isolamento por convenção de código, não estrutural em banco) — mais fraco que o RLS+FK composta que o Partiu já tem e validou com 38 testes negativos.

**Pergunta:** ao extrair os KeroModules (Gates, Audit Log, etc.), a intenção é reescrevê-los para rodar **dentro** do Tenant Core do Partiu (Postgres+RLS), certo? Ou existe um plano de ter um "banco de módulos" separado que os outros produtos (KeroSolar, KeroCar, CongáOne) consumiriam de fora?

☐ Reescrever dentro do Tenant Core do Partiu (mais simples, mas fica amarrado a este repo)
☐ Banco de módulos separado, consumido por todos os produtos (mais trabalho agora, mais reaproveitável depois)

---

## 9. Ordem geral das próximas fases

A auditoria do Ai DEV classificou impacto por fase: Fase 3 (atendimento internacional) BAIXO-MÉDIO, Fase 4 (marketing) ALTO, Fase 5 (Command Center) MUITO ALTO.

**Pergunta:** isso muda a ordem que você tinha em mente? O documento original do Partiu Marrocos sugeria Fase 3 antes da Fase 5, mas a auditoria mostra que a fundação pra Fase 5 (Gates+Audit+Cost) já está pronta e testada em outro projeto, enquanto Fase 3 (i18n, multi-moeda, voz) não tem nenhuma base pronta em lugar nenhum da casa.

☐ Mantém a ordem original (3 → 4 → 5)
☐ Prioriza o que já tem fundação pronta (Command Center primeiro)
☐ Outra ordem

---

*Documento vivo — pode ir marcando e me devolvendo, ou responder direto no chat que eu já sigo.*
