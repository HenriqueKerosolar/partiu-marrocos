"use client";

import { useState } from "react";
import { editorial, type Pacote } from "@/lib/public-site-data";
import { EditorialModal } from "./editorial-modal";

// Réplica de inspirations() em public-site.js.
export function Inspirations() {
  const [active, setActive] = useState<Pacote | null>(null);

  return (
    <section className="scene-block" id="site-inspirations">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>03</span> Viagens sob medida
          </p>
          <h2>
            Três inspirações. <em>O seu próprio ritmo.</em>
          </h2>
        </div>
        <p>Roteiros personalizáveis em grupo ou privados. Consulte datas, hospedagens e valores com nossa equipe.</p>
      </header>
      <div className="inspiration-grid">
        {editorial.pacotes.map((p) => (
          <article className="inspiration-card" key={p.id}>
            <img src={p.img} alt={`${p.nome} ${p.sub}`} />
            <div className="inspiration-content">
              <p className="eyebrow">{p.dias} / {p.noites}</p>
              <h3>
                {p.nome} <em>{p.sub}</em>
              </h3>
              <p>{p.sinopse}</p>
              <div className="reference-price">
                <small>Referência por pessoa</small>
                <strong>{p.preco}</strong>
              </div>
              <button type="button" className="btn secondary" onClick={() => setActive(p)}>
                Ver dia a dia ↗
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="section-note">Sem aéreo internacional. Proposta conforme datas e serviços.</p>

      {active ? (
        <EditorialModal title={`${active.nome} ${active.sub}`} onClose={() => setActive(null)}>
          <img src={active.img} alt={active.sub} className="dialog-landscape" />
          <p>{active.sinopse}</p>
          <ol className="storyboard">
            {active.roteiro.map((d) => (
              <li key={d.n}>
                <small>{d.n}</small>
                <h3>{d.t}</h3>
                <p>{d.d}</p>
                <div className="detail-chips">
                  {d.chips.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <ul>
            {active.inc.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="reference-price">Referência por pessoa · {active.preco}</p>
          <p className="section-note">Sem aéreo internacional. Proposta conforme datas e serviços.</p>
          <a className="btn" href="#site-contact">
            Pedir meu orçamento ↗
          </a>
        </EditorialModal>
      ) : null}
    </section>
  );
}
