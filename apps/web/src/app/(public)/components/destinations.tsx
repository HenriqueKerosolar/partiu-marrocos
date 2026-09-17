"use client";

import { useRef, useState } from "react";
import { editorial, type Destino } from "@/lib/public-site-data";
import { EditorialModal } from "./editorial-modal";

// Réplica de destinations() em public-site.js.
export function Destinations() {
  const reelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Destino | null>(null);

  function slide(dir: "back" | "next") {
    const el = reelRef.current;
    if (!el) return;
    el.scrollBy({ left: (dir === "back" ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section className="scene-block" id="site-destinations">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>01</span> Explore os cenários
          </p>
          <h2>
            Um país. <em>Muitos mundos.</em>
          </h2>
        </div>
        <p>Escolha uma paisagem e descubra o que torna cada lugar inesquecível.</p>
      </header>
      <div className="film-controls">
        <span>MARRAKECH / SAARA / RIF / ATLÂNTICO</span>
        <div>
          <button type="button" className="round-control" onClick={() => slide("back")} aria-label="Anterior">←</button>
          <button type="button" className="round-control" onClick={() => slide("next")} aria-label="Próximo">→</button>
        </div>
      </div>
      <div className="destination-reel" ref={reelRef}>
        {editorial.destinos.map((d, i) => (
          <button key={d.key} type="button" className="destination-frame" onClick={() => setActive(d)}>
            <img src={d.img} alt={d.t} />
            <span className="frame-count">{String(i + 1).padStart(2, "0")} / {editorial.destinos.length}</span>
            <span className="frame-copy">
              <small>{d.k}</small>
              <strong>{d.t}</strong>
              <span>Ver destino ↗</span>
            </span>
          </button>
        ))}
      </div>

      {active ? (
        <EditorialModal title={active.t} onClose={() => setActive(null)}>
          <img src={active.img} alt={active.t} className="dialog-landscape" />
          <p className="eyebrow">{active.k}</p>
          <p>{active.d}</p>
          <div className="detail-chips">
            {active.f.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
          <a className="btn" href="#site-contact">
            Incluir na minha viagem ↗
          </a>
        </EditorialModal>
      ) : null}
    </section>
  );
}
