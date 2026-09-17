"use client";

import { useState } from "react";
import { editorial } from "@/lib/public-site-data";
import { EditorialModal } from "./editorial-modal";

// Réplica de gallery() em public-site.js.
export function Gallery() {
  const [index, setIndex] = useState<number | null>(null);
  const peeks = editorial.peeks;
  const active = index === null ? null : peeks[index];

  return (
    <section className="scene-block" id="site-gallery">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>07</span> Galeria do Marrocos
          </p>
          <h2>
            Espie antes <em>de embarcar.</em>
          </h2>
        </div>
      </header>
      <div className="gallery-grid">
        {peeks.map((p, i) => (
          <button key={p.t} type="button" className="gallery-tile" onClick={() => setIndex(i)}>
            <img src={p.img} alt={p.t} />
            <span>
              <small>{p.k}</small>
              <strong>{p.t}</strong>
              <i aria-hidden="true">⤢</i>
            </span>
          </button>
        ))}
      </div>
      <div className="video-note">
        <span className="video-icon" aria-hidden="true">▷</span>
        <div>
          <h3>Marrocos em movimento</h3>
          <p>Novos episódios em breve. Enquanto isso, explore nossos cenários.</p>
        </div>
      </div>

      {active ? (
        <EditorialModal title={active.t} onClose={() => setIndex(null)}>
          <img src={active.img} alt={active.t} className="dialog-landscape" />
          <div className="gallery-dialog-caption">
            <p>{active.k} · {index! + 1} / {peeks.length}</p>
            <div>
              <button type="button" className="round-control" onClick={() => setIndex((i) => (i! - 1 + peeks.length) % peeks.length)} aria-label="Anterior">←</button>
              <button type="button" className="round-control" onClick={() => setIndex((i) => (i! + 1) % peeks.length)} aria-label="Próximo">→</button>
            </div>
          </div>
        </EditorialModal>
      ) : null}
    </section>
  );
}
