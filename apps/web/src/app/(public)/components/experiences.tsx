"use client";

import { useState } from "react";
import { editorial, type Experiencia } from "@/lib/public-site-data";
import { EditorialModal } from "./editorial-modal";

// Réplica de experiences() em public-site.js.
export function Experiences() {
  const [active, setActive] = useState<Experiencia | null>(null);

  return (
    <section className="scene-block" id="site-experiences">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>04</span> Experiências
          </p>
          <h2>
            Cenas para <em>viver de perto.</em>
          </h2>
        </div>
        <p>Seu próximo momento favorito pode estar aqui.</p>
      </header>
      <div className="experience-mosaic">
        {editorial.experiencias.map((x, i) => (
          <button key={x.t} type="button" className="experience-tile" onClick={() => setActive(x)}>
            <img src={x.img} alt={x.t} />
            <span>
              <small>0{i + 1} / {x.tk.replace(/EXT · |INT · /g, "")}</small>
              <strong>{x.t}</strong>
              <i aria-hidden="true">↗</i>
            </span>
          </button>
        ))}
      </div>

      {active ? (
        <EditorialModal title={active.t} onClose={() => setActive(null)}>
          <img src={active.img} alt={active.t} className="dialog-landscape" />
          <p>{active.d}</p>
          <a className="btn" href="#site-contact">
            Incluir na minha viagem ↗
          </a>
        </EditorialModal>
      ) : null}
    </section>
  );
}
