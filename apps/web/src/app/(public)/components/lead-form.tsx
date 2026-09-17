"use client";

import { useState } from "react";

const TENANT_SLUG = "partiu-marrocos";

export function LeadForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("loading");
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: TENANT_SLUG,
          nome: data.get("nome"),
          telefone: data.get("telefone"),
          email: data.get("email"),
          mensagem: data.get("mensagem"),
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

  if (status === "ok") {
    return (
      <div className="rounded-2xl border border-[#F2A93B]/40 bg-[#0A0F1C] p-6 text-center">
        <p className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#F2A93B]">Pedido recebido!</p>
        <p className="mt-2 text-sm text-[#EDE4D3]/75">
          Nossa equipe entra em contato em breve. Se preferir, fale agora pelo WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] p-6 sm:grid-cols-2">
      <input name="nome" required placeholder="Seu nome" className="rounded-lg border border-[#EDE4D3]/20 bg-transparent px-4 py-2 text-sm text-[#EDE4D3] placeholder:text-[#EDE4D3]/40 focus:border-[#F2A93B] focus:outline-none" />
      <input name="telefone" required placeholder="WhatsApp" className="rounded-lg border border-[#EDE4D3]/20 bg-transparent px-4 py-2 text-sm text-[#EDE4D3] placeholder:text-[#EDE4D3]/40 focus:border-[#F2A93B] focus:outline-none" />
      <input name="email" type="email" placeholder="E-mail (opcional)" className="rounded-lg border border-[#EDE4D3]/20 bg-transparent px-4 py-2 text-sm text-[#EDE4D3] placeholder:text-[#EDE4D3]/40 focus:border-[#F2A93B] focus:outline-none sm:col-span-2" />
      <textarea name="mensagem" rows={3} placeholder="Conte um pouco sobre a viagem que você quer" className="rounded-lg border border-[#EDE4D3]/20 bg-transparent px-4 py-2 text-sm text-[#EDE4D3] placeholder:text-[#EDE4D3]/40 focus:border-[#F2A93B] focus:outline-none sm:col-span-2" />
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-full bg-[#F2A93B] px-6 py-3 text-sm font-semibold text-[#0D2140] transition hover:bg-[#F8C972] disabled:opacity-60 sm:col-span-2"
      >
        {status === "loading" ? "Enviando..." : "Pedir meu orçamento"}
      </button>
      {status === "error" ? <p className="text-xs text-[#D24E1C] sm:col-span-2">Não conseguimos enviar agora — tente novamente em instantes.</p> : null}
    </form>
  );
}
