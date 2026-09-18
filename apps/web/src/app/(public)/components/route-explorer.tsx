"use client";

import { useState } from "react";
import { TravelMap } from "./travel-map";

// Réplica de initRoutes()/routePanel() em public-site.js — routes vem de um
// catálogo próprio (coleção "routes"/"routeId"), que ainda não existe no
// nosso CRM; sem catálogo, o site real cai neste fallback fixo
// (`fallbackRoutes`, extraído literalmente do JS original), que é o que
// sempre aparece hoje. Não são os pacotes/inspirações — essa é a seção
// separada "Três inspirações" (inspirations.tsx), com dados próprios.
const fallbackRoutes = [
  {
    id: "deserto",
    name: "Deserto e kasbahs",
    cities: ["Marrakech", "Dades", "Merzouga", "Marrakech"],
    nights: [0, 1, 1, 0],
    durations: [] as number[],
  },
  {
    id: "imperiais",
    name: "Cidades imperiais e Saara",
    cities: ["Marrakech", "Dades", "Merzouga", "Fez", "Chefchaouen", "Casablanca", "Marrakech"],
    nights: [0, 1, 1, 1, 1, 1, 0],
    durations: [] as number[],
  },
];

export function RouteExplorer() {
  const [selected, setSelected] = useState(0);
  const route = fallbackRoutes[selected]!;

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
        {fallbackRoutes.map((r, i) => (
          <button
            key={r.id}
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
          <p className="map-caption">Roteiros da agência · {route.cities.join(" → ")}</p>
        </div>
        <div className="route-story">
          <p className="eyebrow">Seu próximo destino</p>
          <h3>{route.name}</h3>
          <ol>
            {route.cities.map((c, i) => (
              <li key={`${c}-${i}`}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{c}</strong>
                  <small>
                    {route.nights[i] ? `${route.nights[i]} Pernoite` : "Passagem"}
                    {i < route.cities.length - 1
                      ? ` · ${route.durations[i] ? `${route.durations[i]} min →` : "Tempo de viagem a confirmar"}`
                      : ""}
                  </small>
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
