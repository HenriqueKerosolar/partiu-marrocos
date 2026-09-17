import type { Metadata } from "next";
import { PublicNav } from "../components/public-nav";
import { Footer } from "../components/footer";
import { amazighDestaque, amazighHero, amazighHistorias } from "@/lib/public-site-data";

export const metadata: Metadata = { title: "Universo amazigh · Partiu Marrocos" };

// Réplica de p7amazigh() em proposta/mockup-v11-source.html.
export default function UniversoAmazighPage() {
  return (
    <>
      <PublicNav />
      <div className="p7-destination p7-public">
        <section className="p7-hero">
          <div className="p7-hero-copy">
            <div className="pm-eyebrow">{amazighHero.kicker.toUpperCase()}</div>
            <h1>
              {amazighHero.titulo}
              <br />
              <em>{amazighHero.tituloItalico}</em>
            </h1>
            <p>{amazighHero.subtitle}</p>
            <div className="pm-row">
              <a className="pm-btn pm-primary" href="#merzouga">Conhecer Merzouga</a>
              <a className="pm-btn" href="/sabores-do-marrocos">Sabores do Marrocos</a>
            </div>
          </div>
          <figure>
            <img src={amazighHero.img} alt="Dunas na região de Merzouga" />
            <figcaption>{amazighHero.imgCaption}</figcaption>
          </figure>
        </section>

        <section className="p7-feature" id="merzouga">
          <div>
            <div className="pm-eyebrow">{amazighDestaque.numero} · {amazighDestaque.tag.toUpperCase()}</div>
            <h2>{amazighDestaque.titulo}</h2>
          </div>
          <div>
            <p>{amazighDestaque.texto}</p>
            <a className="pm-btn" href="/#reservar">Abrir história</a>
          </div>
        </section>

        <div className="p7-section-title">
          <h2>Para ir além da paisagem</h2>
          <span className="pm-small">História · comunidades · curiosidades</span>
        </div>
        <div className="p7-story-grid">
          {amazighHistorias.map((h) => (
            <article className="p7-story-card" key={h.numero}>
              <div className="p7-chapter">{h.numero}</div>
              <div className="pm-eyebrow">{h.tag}</div>
              <h3>{h.titulo}</h3>
              <p>{h.texto}</p>
              <a className="pm-btn" href="/#reservar">Ler história</a>
            </article>
          ))}
        </div>

        <section className="p7-respect">
          <div>
            <div className="pm-eyebrow">ENCONTROS</div>
            <h2>Chegue com curiosidade. Escute com respeito.</h2>
          </div>
          <ul>
            <li>Peça autorização antes de fotografar pessoas ou suas casas.</li>
            <li>Combine visitas com o guia e respeite o tempo de quem recebe.</li>
            <li>Ao comprar artesanato, pergunte quem fez a peça e conheça seu trabalho.</li>
          </ul>
        </section>

        <section className="p7-invitation">
          <div>
            <div className="pm-eyebrow">NO SEU CAMINHO</div>
            <h2>Merzouga faz parte da sua próxima viagem.</h2>
          </div>
          <a className="pm-btn pm-primary" href="/#reservar">Ver pacote para Merzouga</a>
        </section>
      </div>
      <Footer />
    </>
  );
}
