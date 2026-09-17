const NUMERO_WHATSAPP = "5521964198106"; // +55 21 96419-8106
const MENSAGEM_INICIAL =
  "Olá! Vim pelo site da Partiu Marrocos e quero um orçamento para minha próxima viagem ao Marrocos.";

/** Botão flutuante que abre uma conversa de WhatsApp real com a equipe, mensagem inicial já preenchida. */
export function WhatsappButton() {
  const href = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(MENSAGEM_INICIAL)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="whatsapp-float" aria-label="Falar pelo WhatsApp">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.76.46 3.48 1.34 5L2 22l5.14-1.35A9.96 9.96 0 0 0 12.04 22c5.52 0 10-4.48 10-10s-4.48-10-10-10zm5.83 15.83a8.15 8.15 0 0 1-5.83 2.42 8.19 8.19 0 0 1-4.17-1.14l-.3-.18-3.05.8.82-2.97-.2-.31A8.17 8.17 0 1 1 17.87 17.83z" />
      </svg>
    </a>
  );
}
