"use client";

import { useEffect, useRef, useState } from "react";

const TENANT_SLUG = "partiu-marrocos";
const POLL_MS = 4000;

type Mensagem = {
  id: string;
  direction: "ENTRADA" | "SAIDA";
  conteudo: string;
  translatedConteudo: string | null;
  detectedLanguage: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  translatedMediaUrl: string | null;
  translatedMediaType: string | null;
  createdAt: string;
};

function obterVisitorId(): string {
  try {
    const existente = localStorage.getItem("pm_visitor_id");
    if (existente) return existente;
    const novo = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem("pm_visitor_id", novo);
    return novo;
  } catch {
    // localStorage indisponível (aba privada, storage bloqueado) — usa um id
    // só desta sessão de página; funciona, só não sobrevive a um reload.
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/**
 * Chat flutuante do site público — ativa o canal WEBCHAT
 * (api/public/webchat) sobre o mesmo pipeline de tradução do WhatsApp.
 * Entrega "tempo real" por polling simples (ver plano PM-TRANSLATE-01,
 * "Entrega em tempo real" — Vercel serverless não sustenta WebSocket de
 * longa duração; polling evita empurrar a decisão de um provedor de
 * realtime pago no meio desta entrega).
 */
export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVisitorId(obterVisitorId());
  }, []);

  useEffect(() => {
    if (!open || !visitorId) return;
    let cancelado = false;

    async function buscar() {
      try {
        const res = await fetch(`/api/public/webchat?tenantSlug=${TENANT_SLUG}&visitorId=${visitorId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { mensagens: Mensagem[] };
        if (!cancelado) setMensagens(data.mensagens);
      } catch {
        // falha de rede numa checagem de polling não é um erro pro visitante ver — só tenta de novo no próximo ciclo.
      }
    }

    buscar();
    const id = setInterval(buscar, POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [open, visitorId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [mensagens]);

  async function enviarTexto(e: React.FormEvent) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || !visitorId) return;
    setTexto("");
    setEnviando(true);
    try {
      await fetch("/api/public/webchat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: TENANT_SLUG, visitorId, texto: conteudo }),
      });
      const res = await fetch(`/api/public/webchat?tenantSlug=${TENANT_SLUG}&visitorId=${visitorId}`);
      if (res.ok) setMensagens((await res.json()).mensagens);
    } finally {
      setEnviando(false);
    }
  }

  async function anexarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !visitorId) return;
    setAnexando(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/public/webchat/upload", { method: "POST", body: form });
      if (!up.ok) return;
      const { url, mediaType } = (await up.json()) as { url: string; mediaType: string };
      await fetch("/api/public/webchat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: TENANT_SLUG, visitorId, mediaUrl: url, mediaType }),
      });
      const res = await fetch(`/api/public/webchat?tenantSlug=${TENANT_SLUG}&visitorId=${visitorId}`);
      if (res.ok) setMensagens((await res.json()).mensagens);
    } finally {
      setAnexando(false);
    }
  }

  return (
    <>
      <button type="button" className="floating-chat-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Fechar chat" : "Abrir chat com a equipe"}>
        {open ? "✕" : "💬"} <span>{open ? "Fechar" : "Fale com a gente"}</span>
      </button>

      {open ? (
        <div className="floating-chat-panel" role="dialog" aria-label="Chat com a equipe">
          <div className="floating-chat-head">
            <strong>Fale com a gente</strong>
            <span>Texto, foto ou documento — respondemos no seu idioma.</span>
          </div>
          <div className="floating-chat-list" ref={listRef} aria-live="polite">
            {mensagens.length === 0 ? <p className="floating-chat-empty">Manda um oi — alguém da equipe já te responde por aqui.</p> : null}
            {mensagens.map((m) => (
              <div key={m.id} className={`floating-chat-msg ${m.direction === "SAIDA" ? "is-team" : "is-visitor"}`}>
                {m.mediaUrl && m.mediaType === "image" ? <img src={m.mediaUrl} alt="Anexo enviado" className="floating-chat-media" /> : null}
                {m.mediaUrl && m.mediaType === "document" ? (
                  <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="floating-chat-doc">
                    📎 Documento anexado
                  </a>
                ) : null}
                {m.translatedMediaUrl && m.translatedMediaType === "audio" ? <audio controls src={m.translatedMediaUrl} className="floating-chat-audio" /> : null}
                <p lang={m.detectedLanguage ?? undefined}>{m.translatedConteudo ?? m.conteudo}</p>
                {m.translatedConteudo ? <small className="floating-chat-original">{m.conteudo}</small> : null}
              </div>
            ))}
          </div>
          <form onSubmit={enviarTexto} className="floating-chat-form">
            <button type="button" className="floating-chat-attach" onClick={() => fileInputRef.current?.click()} disabled={anexando} aria-label="Anexar foto ou documento">
              {anexando ? "…" : "📎"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" hidden onChange={anexarArquivo} />
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva sua mensagem…"
              aria-label="Mensagem"
              disabled={enviando}
            />
            <button type="submit" className="btn" disabled={enviando || !texto.trim()}>
              Enviar
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
