// Ponto único de registro dos job types do Partiu Marrocos — importar este
// módulo (ou qualquer coisa que o importe transitivamente) garante que
// todos os tipos estejam registrados antes do primeiro claim. Mesmo padrão
// de `packages/db/src/tools/index.ts` (T3): registro roda uma vez por
// processo (cache de módulos do Node).
import "./definitions/whatsapp-enviar-mensagem";
import "./definitions/lead-repescar";
import "./definitions/travel-document-verificar";
import "./definitions/geolocation-purgar-pings";

export { garantirPurgaDePingsAgendada } from "./definitions/geolocation-purgar-pings";

export const JOB_TYPES_REGISTRADOS = [
  "whatsapp.enviar_mensagem",
  "lead.repescar_elegibilidade",
  "travel_document.verificar_pendencias",
  "geolocation.purgar_pings_antigos",
] as const;
