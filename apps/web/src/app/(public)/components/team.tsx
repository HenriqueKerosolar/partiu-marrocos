import { editorial } from "@/lib/public-site-data";

// Réplica de team() em public-site.js.
export function Team() {
  return (
    <section className="scene-block" id="site-team">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>10</span> Sua equipe
          </p>
          <h2>
            Gente de verdade, <em>em cada encontro.</em>
          </h2>
        </div>
        <p>Do planejamento no Brasil à recepção no Marrocos, uma equipe ao seu lado.</p>
      </header>
      <div className="team-grid">
        {editorial.elenco.map((p) => (
          <article key={p.t}>
            <span className="team-monogram">{p.av}</span>
            <div>
              <p className="eyebrow">{p.role.replace("Dona do site · ", "")}</p>
              <h3>{p.t}</h3>
              <p>{p.d}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
