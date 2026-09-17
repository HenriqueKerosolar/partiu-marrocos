import Image from "next/image";
import { heroStats } from "@/lib/public-site-data";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <Image src="/img/saharasunset.jpg" alt="Pôr do sol nas dunas do Saara" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06080F] via-[#06080F]/70 to-[#06080F]/20" />
      </div>
      <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-24 sm:px-10 sm:pb-24 sm:pt-32">
        <p className="text-xs font-[family-name:var(--font-outfit)] uppercase tracking-[0.2em] text-[#F2A93B]">
          Amazigh Turismo &amp; PromoroccoTour apresentam
        </p>
        <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-fraunces)] text-4xl font-semibold leading-tight sm:text-6xl">
          Sua próxima história <span className="italic text-[#F2A93B]">começa no Marrocos.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-[#EDE4D3]/85 sm:text-lg">
          Do silêncio do Saara às ruas azuis de Chefchaouen. Uma viagem feita de encontros, sabores e paisagens que
          ficam com você.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a href="#roteiros" className="rounded-full bg-[#F2A93B] px-6 py-3 text-sm font-semibold text-[#0D2140] transition hover:bg-[#F8C972]">
            Ver os roteiros
          </a>
          <a href="#reservar" className="rounded-full border border-[#EDE4D3]/40 px-6 py-3 text-sm font-semibold text-[#EDE4D3] transition hover:border-[#EDE4D3]">
            Sinta o destino
          </a>
        </div>
        <dl className="mt-14 grid grid-cols-2 gap-6 border-t border-[#EDE4D3]/15 pt-8 sm:grid-cols-4">
          {heroStats.map((stat) => (
            <div key={stat.l}>
              <dt className="sr-only">{stat.l}</dt>
              <dd className="font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-[#F2A93B]">{stat.n}</dd>
              <dd className="mt-1 text-xs uppercase tracking-wide text-[#EDE4D3]/70">{stat.l}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
