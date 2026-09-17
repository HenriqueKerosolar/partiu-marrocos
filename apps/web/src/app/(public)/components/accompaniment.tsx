const PHASES = [
  { t: "Antes de partir", d: "Proposta clara, inclusões e equipe da viagem." },
  { t: "Durante o percurso", d: "Mapa, resumo do dia e atendimento com acompanhamento." },
  { t: "Depois de voltar", d: "Memórias, avaliação e novas experiências." },
];

export function Accompaniment() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold sm:text-3xl">Sua viagem tem acompanhamento.</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {PHASES.map((phase) => (
          <div key={phase.t} className="rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] p-5">
            <h3 className="font-semibold text-[#EDE4D3]">{phase.t}</h3>
            <p className="mt-2 text-sm text-[#EDE4D3]/70">{phase.d}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[#EDE4D3]">Marrocos &amp; Egito</p>
          <p className="text-sm text-[#EDE4D3]/70">Explore o guia de cada país. Roteiros do Egito sob consulta.</p>
        </div>
        <a href="#roteiros" className="text-sm font-semibold text-[#F2A93B] hover:underline">
          Explorar destinos →
        </a>
      </div>
    </section>
  );
}
