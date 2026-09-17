import type { Metadata } from "next";
import "./public-site.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partiu Marrocos · Sua viagem, por inteiro",
  description: "Roteiros pelo Marrocos com curadoria brasileira: deserto, cidades imperiais e a cidade azul, do jeito que fica na memória.",
};

// public-site.css é o CSS real extraído de
// partiumarrocos.com.br-php74-0.4.11/app/public-site.js — a fonte correta e
// completa do site público (achado: a versão anterior usava um mockup
// pequeno/incompleto, "proposta/preview-v11.html", como fonte; o pacote
// PHP7.4 + Firebase enviado pelo usuário é que tem a home real, com todas as
// seções — stats, roteiros com mapa, inspirações, experiências, amazigh,
// sabores, galeria, curiosidades, depoimentos, equipe, FAQ). Sem Google
// Fonts: o design usa só Georgia/serif (headings) e monospace (rótulos),
// ambas fontes de sistema — não há @font-face nem link externo no original.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`body{background:#080e19}`}</style>
      {children}
    </>
  );
}
