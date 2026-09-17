import { editorial } from "@/lib/public-site-data";
import { AmazighJournal } from "./amazigh-journal";

// Réplica de amazigh() em public-site.js — a seção é idêntica na home e na
// página própria de "Universo amazigh" (sectionPage só acrescenta um <h1>).
export function AmazighScene() {
  return (
    <section className="scene-block amazigh-scene" id="site-amazigh">
      <div className="amazigh-art">
        <img src="/img/berbercamp.jpg" alt="Hospitalidade em Merzouga" />
        <span aria-hidden="true">ⵣ</span>
        <small>MERZOUGA / ERG CHEBBI</small>
      </div>
      <div className="amazigh-copy">
        <p className="eyebrow">ⵣ · História e hospitalidade</p>
        <h2>
          A alma <em>da terra.</em>
        </h2>
        <h3>Encontros em Merzouga</h3>
        <p>
          Histórias, música, hospitalidade e modos de vida amazigh. Conheça as comunidades nômades com respeito a
          quem faz deste lugar a sua casa.
        </p>
        <blockquote>{editorial.alma.quote}</blockquote>
      </div>
      <AmazighJournal />
    </section>
  );
}
