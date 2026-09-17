"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpButton } from "@/components/help-button";
import "../../(public)/mockup.css";

export const dynamic = "force-dynamic";

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
    <div className="pm-public" style={{ minHeight: "100vh", display: "flex", alignItems: "center" }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Outfit:wght@400;500&family=Space+Mono&display=swap"
        rel="stylesheet"
      />
      <section className="pm-panel pm-signin" style={{ width: "100%" }}>
        <div className="pm-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          BEM-VINDO À PARTIU MARROCOS <HelpButton helpKey="auth.login" />
        </div>
        <h1>
          Sua próxima história <em>começa aqui.</em>
        </h1>
        <p className="pm-small" style={{ marginBottom: 19 }}>Entre com seu email e senha.</p>
        <form onSubmit={onSubmit}>
          <label className="pm-field" htmlFor="email">
            Email
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="pm-field" htmlFor="password">
            Senha
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {erro && <p className="pm-small" style={{ color: "var(--pm-orange)", marginBottom: 13 }}>{erro}</p>}
          <button type="submit" className="pm-btn pm-primary" disabled={carregando} style={{ width: "100%" }}>
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </div>
  );
}
