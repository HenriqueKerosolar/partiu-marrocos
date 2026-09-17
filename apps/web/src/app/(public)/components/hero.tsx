import Image from "next/image";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <Image src="/img/atlas.jpg" alt="Estrada pelas montanhas do Atlas" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080F] via-[#06080F]/70 to-[#06080F]/20" />
      </div>
      <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-24 sm:px-10 sm:pb-24 sm:pt-32">
        <p className="text-xs font-[family-name:var(--font-outfit)] uppercase tracking-[0.2em] text-[#F2A93B]">
          Amazigh Turismo &amp; PromoroccoTour
        </p>
        <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-fraunces)] text-4xl font-semibold leading-tight sm:text-6xl">
          Viaje o Marrocos. <span className="italic text-[#F2A93B]">Viva cada caminho.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-[#EDE4D3]/85 sm:text-lg">
          Da primeira conversa à última curva, sua agência viaja com você.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a href="#roteiros" className="rounded-full bg-[#F2A93B] px-6 py-3 text-sm font-semibold text-[#0D2140] transition hover:bg-[#F8C972]">
            Encontre seu roteiro
          </a>
          <a href="/login" className="rounded-full border border-[#EDE4D3]/40 px-6 py-3 text-sm font-semibold text-[#EDE4D3] transition hover:border-[#EDE4D3]">
            Já tenho uma viagem
          </a>
        </div>
      </div>
    </section>
  );
}
