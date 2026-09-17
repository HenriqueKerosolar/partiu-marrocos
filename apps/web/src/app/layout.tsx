import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

// App inteiro é autenticado (cookies) — nada aqui se beneficia de geração
// estática. Forçar dinâmico no layout raiz também cobre /_not-found (rota
// implícita do App Router), que crashava na prerenderização estática mesmo
// com o page-level dynamic export nos grupos de rota — bug do Next 14.2.x.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partiu Marrocos",
  description: "CRM de turismo internacional",
  manifest: "/manifest.webmanifest",
  // PM-CONV-06, §Track B — fecha a lacuna declarada no PM-CONV-05 (ícone
  // só em SVG): `apple-touch-icon` (usado pelo "Adicionar à Tela de Início"
  // do iOS/Safari) NÃO suporta SVG — precisa ser raster de verdade, senão o
  // iOS simplesmente não mostra ícone nenhum. PNGs gerados uma única vez a
  // partir do MESMO `icon.svg` (nenhum redesenho — só resolução de formato)
  // via `resvg-cli` (ferramenta usada só no momento da geração, nunca
  // adicionada como dependência do projeto).
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
