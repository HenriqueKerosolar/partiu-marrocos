import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";

export const dynamic = "force-dynamic";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: "Partiu Marrocos · Sua viagem, por inteiro",
  description: "Roteiros pelo Marrocos com curadoria brasileira: deserto, cidades imperiais e a cidade azul, do jeito que fica na memória.",
};

// Site público tem identidade visual própria (fundo escuro, âmbar, Fraunces/
// Outfit) — separada da paleta neutra clara do painel interno autenticado
// (globals.css). Escopar aqui em vez de mexer nos tokens globais evita
// vazar esse tema pro resto do CRM.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${outfit.variable} bg-[#06080F] font-[family-name:var(--font-outfit)] text-[#EDE4D3] antialiased`}>
      {children}
    </div>
  );
}
