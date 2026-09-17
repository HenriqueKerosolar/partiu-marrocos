const STEPS = [
  ["Antes de partir", "Escolha o roteiro e fale com quem conhece o destino."],
  ["Na estrada", "Mapa, equipe e hospedagens sempre com você."],
  ["Para lembrar", "Reveja os lugares por onde sua viagem passou."],
];

export function Highlights() {
  return (
    <div className="pm-steps">
      {STEPS.map(([t, d], i) => (
        <div className="pm-step" key={t}>
          <span>{`0${i + 1}`}</span>
          <h3>{t}</h3>
          <p className="pm-small">{d}</p>
        </div>
      ))}
    </div>
  );
}
