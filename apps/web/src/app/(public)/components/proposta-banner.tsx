// "SUA PROPOSTA" + "Viaje ou seja nosso parceiro" — as duas faixas que
// abrem a página logo abaixo do menu, antes do hero, no mockup 0.4.11.
export function PropostaBanner() {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 sm:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#F2A93B]">Sua proposta</p>
          <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold">Pronto para a próxima viagem?</h2>
        </div>
        <a href="#roteiros" className="shrink-0 rounded-full bg-[#F2A93B] px-6 py-3 text-sm font-semibold text-[#0D2140] transition hover:bg-[#F8C972]">
          Comprar pacote
        </a>
      </div>
      <div className="mt-6 flex flex-col gap-3 rounded-2xl border-l-4 border-[#F2A93B] bg-[#0D2140] p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-[#EDE4D3]">Viaje ou seja nosso parceiro.</p>
        <a href="/login" className="shrink-0 rounded-full bg-[#F2A93B] px-6 py-3 text-center text-sm font-semibold text-[#0D2140] transition hover:bg-[#F8C972]">
          Entrar / Cadastrar
        </a>
      </div>
    </div>
  );
}
