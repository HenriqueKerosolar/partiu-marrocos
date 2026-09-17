import Image from "next/image";
import { pacotes } from "@/lib/public-site-data";

export function Roteiros() {
  return (
    <section id="roteiros" className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <p className="text-xs uppercase tracking-[0.2em] text-[#F2A93B]">Sua proposta</p>
      <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl font-semibold sm:text-4xl">Pronto para a próxima viagem?</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {pacotes.map((pacote) => (
          <article
            key={pacote.id}
            className={`flex flex-col overflow-hidden rounded-2xl border ${pacote.featured ? "border-[#F2A93B]" : "border-[#EDE4D3]/15"} bg-[#0A0F1C]`}
          >
            <div className="relative h-36 w-full">
              <Image src={pacote.img} alt={pacote.sub} fill className="object-cover" />
              {pacote.badge ? (
                <span className="absolute right-3 top-3 rounded-full bg-[#F2A93B] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#0D2140]">
                  {pacote.badge}
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#EDE4D3]/60">
                <span>{pacote.emoji}</span>
                <span>{pacote.dias} · {pacote.noites}</span>
              </div>
              <h3 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold">Marrocos {pacote.sub}</h3>
              <p className="text-sm text-[#EDE4D3]/75">{pacote.sinopse}</p>
              <ul className="mt-1 space-y-1 text-xs text-[#EDE4D3]/65">
                {pacote.inc.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-[#EDE4D3]/10 pt-1 text-xs text-[#EDE4D3]/60">
                <span>{pacote.rota.stops.map((s) => s.n).join(" → ")}</span>
              </div>
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="font-[family-name:var(--font-fraunces)] text-lg font-semibold text-[#F2A93B]">{pacote.preco}</span>
                <a
                  href="#reservar"
                  className="rounded-full bg-[#F2A93B] px-4 py-2 text-xs font-semibold text-[#0D2140] transition hover:bg-[#F8C972]"
                >
                  Quero esse roteiro
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6 text-xs text-[#EDE4D3]/50">
        Valores de referência por pessoa em quarto duplo, sem aéreo internacional. Cada viagem é orçada sob medida —{" "}
        <a href="#reservar" className="underline">peça seu orçamento personalizado</a>.
      </p>
    </section>
  );
}
