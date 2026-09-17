import Image from "next/image";
import { amazighParas, destinos, sabores } from "@/lib/public-site-data";

export function AmazighSabores() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <p className="text-xs uppercase tracking-[0.2em] text-[#F2A93B]">Para conhecer mais</p>
      <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl font-semibold sm:text-4xl">As histórias e os sabores da viagem.</h2>

      <div id="amazigh" className="mt-10 scroll-mt-24 rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] p-6 sm:p-8">
        <h3 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#F2A93B]">Universo amazigh</h3>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#EDE4D3]/80">
          {amazighParas.map((p) => (
            <p key={p.slice(0, 20)}>{p}</p>
          ))}
        </div>
      </div>

      <div id="sabores" className="mt-8 scroll-mt-24">
        <h3 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#F2A93B]">Sabores do Marrocos</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          {sabores.map((prato) => (
            <div key={prato.t} className="overflow-hidden rounded-xl border border-[#EDE4D3]/15 bg-[#0A0F1C]">
              <div className="relative h-28 w-full">
                <Image src={prato.img} alt={prato.t} fill className="object-cover" />
              </div>
              <div className="p-3">
                <p className="font-semibold text-[#EDE4D3]">{prato.t}</p>
                <p className="mt-1 text-xs text-[#EDE4D3]/65">{prato.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div id="destinos" className="mt-8 scroll-mt-24">
        <h3 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#F2A93B]">Destinos</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {destinos.map((destino) => (
            <div key={destino.key} className="overflow-hidden rounded-xl border border-[#EDE4D3]/15 bg-[#0A0F1C]">
              <div className="relative h-32 w-full">
                <Image src={destino.img} alt={destino.t} fill className="object-cover" />
              </div>
              <div className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-[#F2A93B]">{destino.k}</p>
                <p className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold">{destino.t}</p>
                <p className="mt-2 text-xs text-[#EDE4D3]/65">{destino.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
