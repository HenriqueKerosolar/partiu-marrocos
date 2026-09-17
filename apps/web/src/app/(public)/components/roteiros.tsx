import Image from "next/image";
import { parceiroLocal, roteiros } from "@/lib/public-site-data";

export function Roteiros() {
  return (
    <section id="roteiros" className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold sm:text-3xl">Escolha sua próxima história.</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {roteiros.map((roteiro) => (
          <article key={roteiro.id} className="overflow-hidden rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C]">
            <div className="relative h-40 w-full">
              <Image src={roteiro.img} alt={roteiro.nome} fill className="object-cover" />
            </div>
            <div className="p-5">
              <p className="text-xs uppercase tracking-wide text-[#EDE4D3]/60">
                {roteiro.dias} · {roteiro.noites}
              </p>
              <h3 className="mt-1 font-[family-name:var(--font-fraunces)] text-xl font-semibold">{roteiro.nome}</h3>
              <p className="mt-2 text-xs text-[#EDE4D3]/65">{roteiro.stops.join(" → ")}</p>
              <div className="mt-4 flex items-center justify-between">
                <a href={`#roteiro-${roteiro.id}`} className="text-sm font-semibold text-[#F2A93B] hover:underline">
                  Roteiro completo →
                </a>
                <a href="#reservar" className="rounded-full bg-[#F2A93B] px-4 py-2 text-xs font-semibold text-[#0D2140] transition hover:bg-[#F8C972]">
                  Quero esse roteiro
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#F2A93B]/20 bg-[#0D2140] p-5">
        <div className="flex items-center gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
            <Image src={parceiroLocal.img} alt={parceiroLocal.t} fill className="object-cover" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#F2A93B]">Publicidade · Parceiro local</p>
            <p className="font-semibold text-[#EDE4D3]">{parceiroLocal.t}</p>
            <p className="text-xs text-[#EDE4D3]/65">{parceiroLocal.d}</p>
          </div>
        </div>
        <a href="#reservar" className="shrink-0 rounded-full border border-[#EDE4D3]/30 px-4 py-2 text-xs font-semibold text-[#EDE4D3] transition hover:border-[#EDE4D3]">
          Conhecer →
        </a>
      </div>
    </section>
  );
}
