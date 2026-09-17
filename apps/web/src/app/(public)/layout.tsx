import type { Metadata } from "next";
import "./mockup.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partiu Marrocos · Sua viagem, por inteiro",
  description: "Roteiros pelo Marrocos com curadoria brasileira: deserto, cidades imperiais e a cidade azul, do jeito que fica na memória.",
};

// mockup.css é o CSS exato extraído de proposta/mockup-v11-source.html
// (achado real: a versão anterior desta home foi feita "parecida", por
// aproximação em Tailwind, e divergia do mockup em vários pontos — imagem
// errada, seletor de idioma faltando, "Universo amazigh"/"Sabores do
// Marrocos" viraram abas quando no mockup são páginas próprias. Pedido
// explícito do usuário: clone, não aproximação. As classes pm-*/p7-* e as
// fontes (Google Fonts direto, não next/font, pra bater com os nomes de
// família literais usados no CSS) são as mesmas do arquivo-fonte.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Outfit:wght@400;500&family=Space+Mono&display=swap"
        rel="stylesheet"
      />
      <div className="pm-public">{children}</div>
    </>
  );
}
