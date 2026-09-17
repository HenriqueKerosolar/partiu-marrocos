import { highlights } from "@/lib/public-site-data";

export function Highlights() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <p className="text-xs uppercase tracking-[0.2em] text-[#F2A93B]">Marrocos / muito além da paisagem</p>
      <h2 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl font-semibold sm:text-4xl">
        Existem viagens que a gente conta. <span className="italic text-[#F2A93B]">E outras que a gente revive de olhos fechados.</span>
      </h2>
      <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {highlights.map((item, i) => (
          <div key={item.t} className="border-t border-[#EDE4D3]/15 pt-4">
            <span className="text-xs text-[#F2A93B]">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-1 font-[family-name:var(--font-fraunces)] text-xl font-semibold">{item.t}</h3>
            <p className="mt-2 text-sm text-[#EDE4D3]/75">{item.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
