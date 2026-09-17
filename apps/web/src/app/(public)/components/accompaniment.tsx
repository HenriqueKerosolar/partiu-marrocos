const PHASES = [
  ["Antes de partir", "Proposta clara, inclusões e equipe da viagem."],
  ["Durante o percurso", "Mapa, resumo do dia e atendimento com acompanhamento."],
  ["Depois de voltar", "Memórias, avaliação e novas experiências."],
];

export function Accompaniment() {
  return (
    <>
      <div className="pm-vsubhead">
        <h2>Sua viagem tem acompanhamento.</h2>
      </div>
      <div className="pm-grid3">
        {PHASES.map(([t, d]) => (
          <section className="pm-panel pm-pad" key={t}>
            <h3 style={{ margin: "10px 0" }}>{t}</h3>
            <p className="pm-small">{d}</p>
          </section>
        ))}
      </div>
      <div className="pm-vquiet">
        <div>
          <b>Marrocos &amp; Egito</b>
          <p className="pm-small">Explore o guia de cada país. Roteiros do Egito sob consulta.</p>
        </div>
        <a className="pm-btn" href="#roteiros">Explorar destinos →</a>
      </div>
    </>
  );
}
