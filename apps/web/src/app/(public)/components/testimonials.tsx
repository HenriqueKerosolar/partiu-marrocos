import { editorial } from "@/lib/public-site-data";

// Réplica de testimonials() em public-site.js.
export function Testimonials() {
  return (
    <section className="scene-block" id="site-stories">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>09</span> Relatos de viajantes
          </p>
          <h2>
            Quem foi, <em>voltou apaixonado.</em>
          </h2>
        </div>
      </header>
      <div className="review-reel">
        {editorial.quotes.map((q) => (
          <figure className="review-card" key={q.a}>
            <span className="review-stars" aria-hidden="true">“</span>
            <blockquote>{q.p.replace(/^"|"$/g, "")}</blockquote>
            <figcaption>
              <span className="review-avatar">{q.a[0]}</span>
              <div>
                <strong>{q.a}</strong>
                <small>{q.s}</small>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
