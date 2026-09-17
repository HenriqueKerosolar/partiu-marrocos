import { editorial } from "@/lib/public-site-data";

// Réplica de facts() em public-site.js.
export function Facts() {
  return (
    <section className="scene-block" id="site-facts">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>08</span> Marrocos
          </p>
          <h2>
            Pequenas descobertas. <em>Grandes histórias.</em>
          </h2>
        </div>
      </header>
      <div className="fact-grid">
        {editorial.fatos.map((f, i) => (
          <details className="fact-card" key={f.t}>
            <summary>
              <span>0{i + 1}</span>
              <h3>{f.t}</h3>
              <b aria-hidden="true">+</b>
            </summary>
            <p>{f.d}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
