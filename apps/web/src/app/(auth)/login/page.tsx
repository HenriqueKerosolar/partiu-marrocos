"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicNav } from "../../(public)/components/public-nav";
import "../../(public)/public-site.css";

export const dynamic = "force-dynamic";

const BENEFICIOS = [
  { t: "Cliente", d: "Viagens e reservas" },
  { t: "Parceiro", d: "Indicações e comissões" },
  { t: "Guia", d: "Grupos e percursos" },
  { t: "Administração", d: "Gestão da agência" },
];

// Réplica de <section class="access-layout"> em app.js, conferida ao vivo em
// 127.0.0.1:8080/app/#login. O original usa só "Continuar com Google"
// (data-action="google-login") — o CRM não tem OAuth implementado, então o
// card mantém o formulário real de email/senha (/api/auth/login) em vez de
// simular um botão que não funcionaria.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível entrar.");
        return;
      }
      router.push(data.redirectTo ?? "/dashboard");
      router.refresh();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <style>{`body{background:#080e19}`}</style>
      <PublicNav onHome={false} helpKey="auth.login" />
      <div className="public-editorial" data-public-landing>
        <section className="access-layout">
          <div className="access-intro">
            <p className="eyebrow">Partiu Marrocos</p>
            <h1>Seu próximo destino começa aqui.</h1>
            <div className="access-benefits">
              {BENEFICIOS.map((b) => (
                <div key={b.t}>
                  <strong>{b.t}</strong>
                  <span>{b.d}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="access-card">
            <img className="access-logo" src="/img/logo.png" alt="Partiu Marrocos" />
            <h2>Bem-vindo à sua área</h2>
            <p>Entre com seu email e senha para acessar suas viagens ou seu espaço de trabalho.</p>
            <form onSubmit={onSubmit} style={{ marginTop: 18 }}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span>Senha</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {erro ? <p style={{ color: "#D24E1C", fontSize: 13, marginTop: 12 }}>{erro}</p> : null}
              <button type="submit" className="btn" disabled={carregando} style={{ width: "100%", marginTop: 18, minHeight: 54, justifyContent: "center" }}>
                {carregando ? "Entrando…" : "Entrar"}
              </button>
            </form>
            <a className="access-help" href="mailto:info@partiumarrocos.com.br">
              Precisa de ajuda para acessar?
            </a>
            <a className="btn secondary access-back" href="/">
              ← Voltar ao site
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
