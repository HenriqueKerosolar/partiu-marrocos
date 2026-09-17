"use client";

import { useState } from "react";
import { editorial } from "@/lib/public-site-data";
import { TravelMap } from "./travel-map";

// Réplica de routeExplorer()/routePanel() em public-site.js — usa a mesma
// rota (cidades) dos pacotes/inspirações, uma por roteiro de referência.
const routes = editorial.pacotes.map((p) => ({
  name: `${p.nome} ${p.sub}`,
  cities: p.rota.stops.map((s) => (s.n.split(" · ")[0] ?? s.n).split(" (")[0] ?? s.n),
  stops: p.rota.stops,
}));

export function RouteExplorer() {
  const [selected, setSelected] = useState(0);
  const route = routes[selected]!;

  return (
    <section className="scene-block route-scene" id="site-routes">
      <header className="scene-heading">
        <div>
          <p className="eyebrow">
            <span>02</span> Roteiros da agência
          </p>
          <h2>
            O caminho também <em>faz parte da viagem.</em>
          </h2>
        </div>
        <p>Percorra o mapa, conheça as cidades e encontre o seu ritmo.</p>
      </header>
      <div className="route-tabs" role="tablist" aria-label="Roteiro">
        {routes.map((r, i) => (
          <button
            key={r.name}
            id={`route-tab-${i}`}
            role="tab"
            aria-selected={i === selected}
            tabIndex={i === selected ? 0 : -1}
            className="route-tab"
            onClick={() => setSelected(i)}
          >
            <span>0{i + 1}</span>
            {r.name}
          </button>
        ))}
      </div>
      <div id="route-detail" role="tabpanel" aria-labelledby={`route-tab-${selected}`} className="route-detail">
        <div className="route-map-wrap">
          <TravelMap cities={route.cities} />
          <p className="map-caption">Roteiros da agência · {route.stops.map((s) => s.n).join(" → ")}</p>
        </div>
        <div className="route-story">
          <p className="eyebrow">Seu próximo destino</p>
          <h3>{route.name}</h3>
          <ol>
            {route.stops.map((s, i) => (
              <li key={s.n}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{s.n}</strong>
                  <small>{s.s}</small>
                </div>
              </li>
            ))}
          </ol>
          <a className="btn" href="#site-contact">
            Consultar este roteiro ↗
          </a>
        </div>
      </div>
    </section>
  );
}
