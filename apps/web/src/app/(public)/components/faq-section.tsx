import { editorial } from "@/lib/public-site-data";

function clean(html: string) {
  return html.replace(/<[^>]*>/g, "");
}

// Réplica de faq() em public-site.js.
export function FaqSection() {
  return (
    <section className="scene-block faq-scene" id="site-faq">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>11</span> Dúvidas antes da viagem
          </p>
          <h2>
            Tudo pronto <em>para partir?</em>
          </h2>
        </div>
      </header>
      <div className="faq-list">
        {editorial.faq.map((f, i) => (
          <details key={f.q}>
            <summary>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {f.q.replace(/^[^\p{L}\p{N}¿¡]+/u, "")}
              <b aria-hidden="true">+</b>
            </summary>
            <div>
              <p>{clean(f.a)}</p>
              {f.source ? (
                <a className="btn secondary" href={f.source} target="_blank" rel="noopener noreferrer">
                  Consultar orientação oficial ↗
                </a>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
