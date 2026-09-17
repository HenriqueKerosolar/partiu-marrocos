"use client";

import { useState } from "react";

const TENANT_SLUG = "partiu-marrocos";

const PEOPLE = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13+"];
const INTERESSE = [
  "Marrocos Básico (5 dias)",
  "Marrocos Essencial (8 dias)",
  "Marrocos Total (12 dias)",
  "Roteiro personalizado",
  "Ainda não sei",
];
const ESTILO = ["Em grupo", "Privado / sob medida", "Ainda não sei"];
const ORCAMENTO = ["Prefiro não dizer", "Até R$ 5.000", "R$ 5.000 – R$ 8.000", "R$ 8.000 – R$ 12.000", "Acima de R$ 12.000"];

// Réplica visual de cta() em public-site.js — o envio usa o endpoint real
// /api/public/leads (já grava o lead no CRM), os campos extras do mockup
// (nº de pessoas, mês, interesse, estilo, orçamento) viram parte da mensagem.
export function Contact() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const partes = [
      data.get("people") ? `Nº de pessoas: ${data.get("people")}` : null,
      data.get("month") ? `Quando pretende ir: ${data.get("month")}` : null,
      data.get("interest") ? `Pacote de interesse: ${data.get("interest")}` : null,
      data.get("travelStyle") ? `Tipo de viagem: ${data.get("travelStyle")}` : null,
      data.get("budget") ? `Orçamento por pessoa: ${data.get("budget")}` : null,
      data.get("partnerCode") ? `Código do parceiro: ${data.get("partnerCode")}` : null,
      data.get("note") ? `Mensagem: ${data.get("note")}` : null,
    ].filter(Boolean);
    setStatus("loading");
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: TENANT_SLUG,
          nome: data.get("name"),
          telefone: data.get("phone"),
          email: data.get("email"),
          mensagem: partes.join("\n"),
          origem: "site",
          landingPage: window.location.href,
          referrer: document.referrer || undefined,
        }),
      });
      if (!res.ok) throw new Error("falha");
      setStatus("ok");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="site-contact scene-block" id="site-contact">
      <img src="/img/berbercamp.jpg" alt="Acampamento em Merzouga" className="contact-image" />
      <div className="contact-copy">
        <p className="eyebrow">PARTIU MARROCOS · AMAZIGH TURISMO</p>
        <h2>
          Agora, a próxima <em>história é sua.</em>
        </h2>
        <p>Conte o que você sonha viver. Nossa equipe prepara um orçamento personalizado, sem compromisso.</p>
        <p className="contact-checks">✓ Sem compromisso · Atendimento em português</p>
        <a className="contact-email" href="mailto:info@partiumarrocos.com.br">info@partiumarrocos.com.br</a>
      </div>
      <div className="contact-form">
        <p className="eyebrow">Por onde começamos?</p>
        {status === "ok" ? (
          <p style={{ color: "#edca8b" }}>Pedido recebido! Nossa equipe entra em contato em breve.</p>
        ) : (
          <form onSubmit={onSubmit} className="formgrid" style={{ display: "grid", gap: 16 }}>
            <label className="field">
              Nome completo
              <input name="name" type="text" required />
            </label>
            <label className="field">
              E-mail
              <input name="email" type="email" required />
            </label>
            <label className="field">
              Telefone
              <input name="phone" type="tel" required />
            </label>
            <label className="field">
              Nº de pessoas
              <select name="people" defaultValue="">
                <option value="" disabled></option>
                {PEOPLE.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Quando pretende ir?
              <input name="month" type="month" />
            </label>
            <label className="field">
              Pacote de interesse
              <select name="interest" defaultValue="">
                <option value="" disabled></option>
                {INTERESSE.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Tipo de viagem
              <select name="travelStyle" defaultValue="">
                <option value="" disabled></option>
                {ESTILO.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Orçamento por pessoa
              <select name="budget" defaultValue="">
                <option value="" disabled></option>
                {ORCAMENTO.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Código do parceiro
              <input name="partnerCode" type="text" />
            </label>
            <label className="field">
              Mensagem
              <textarea name="note" />
            </label>
            {status === "error" ? <p style={{ color: "#D24E1C" }}>Não conseguimos enviar agora — tente novamente em instantes.</p> : null}
            <div className="actions">
              <button type="submit" className="btn" disabled={status === "loading"}>
                {status === "loading" ? "Enviando…" : "Pedir meu orçamento"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
