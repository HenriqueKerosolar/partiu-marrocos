import { editorial } from "@/lib/public-site-data";

// Réplica de why() em public-site.js.
export function Why() {
  return (
    <section className="scene-block why-scene">
      <div className="why-title">
        <p className="eyebrow">MARROCOS / MUITO ALÉM DA PAISAGEM</p>
        <h2>
          Existem viagens que a gente conta.
          <br />
          <em>E outras que a gente revive de olhos fechados.</em>
        </h2>
      </div>
      <div className="why-grid">
        {editorial.trailer.takes.map((x, i) => (
          <article key={x.t}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <h3>{x.t}</h3>
            <p>{x.d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
