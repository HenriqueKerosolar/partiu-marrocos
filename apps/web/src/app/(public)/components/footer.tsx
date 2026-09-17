import { LeadForm } from "./lead-form";

export function Footer() {
  return (
    <footer id="reservar" className="scroll-mt-24 border-t border-[#EDE4D3]/10 bg-[#0A0F1C]/60 px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-[#F2A93B]">Pedir meu orçamento</p>
        <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl font-semibold">Viaje ou seja nosso parceiro.</h2>
        <p className="mt-2 text-sm text-[#EDE4D3]/70">
          Conta pra gente quando quer viajar e o que sonha em conhecer — o resto é com nossa equipe.
        </p>
        <div className="mt-8">
          <LeadForm />
        </div>
      </div>
      <div className="mx-auto mt-16 flex max-w-5xl flex-col items-start justify-between gap-4 border-t border-[#EDE4D3]/10 pt-8 text-xs text-[#EDE4D3]/50 sm:flex-row sm:items-center">
        <p>Feito com alma brasileira &amp; coração amazigh · © 2026 Partiu Marrocos · Todos os direitos reservados</p>
        <a href="/login" className="text-[#F2A93B] hover:underline">
          Acessar minha viagem →
        </a>
      </div>
    </footer>
  );
}
