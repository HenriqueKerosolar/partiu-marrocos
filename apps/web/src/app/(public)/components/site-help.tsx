"use client";

import { useState } from "react";
import { EditorialModal } from "./editorial-modal";

// Réplica de actions['site-help']/actions['site-help-topic'] em
// public-site.js — o botão flutuante "Yalla" abre um modal com atalhos por
// assunto (não é só um link de rolagem, que era a simplificação anterior).
const TOPICS: [string, string][] = [
  ["Pacotes", "#site-departures"],
  ["Melhor época", "#site-faq"],
  ["Passaporte e visto", "#site-faq"],
  ["Moeda e câmbio", "#site-faq"],
  ["Gastronomia", "#site-food"],
  ["Copa 2030", "#site-facts"],
];

export function SiteHelp() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="site-help" onClick={() => setOpen(true)}>
        <span>✦</span> Yalla <small>Ajuda para sua viagem</small>
      </button>

      {open ? (
        <EditorialModal title="Yalla" onClose={() => setOpen(false)}>
          <p>Escolha um assunto para explorar ou fale com nossa equipe.</p>
          <div className="help-topics">
            {TOPICS.map(([label, href]) => (
              <a key={label} className="btn secondary" href={href} onClick={() => setOpen(false)}>
                {label} ↗
              </a>
            ))}
          </div>
          <a className="btn" href="#site-contact" onClick={() => setOpen(false)}>
            Falar com a equipe ↗
          </a>
        </EditorialModal>
      ) : null}
    </>
  );
}
