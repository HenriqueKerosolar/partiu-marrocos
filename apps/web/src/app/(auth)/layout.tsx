// export const dynamic só tem efeito em Server Component — login/page.tsx e
// trocar-senha/page.tsx são "use client" (formulário interativo), então essa
// configuração precisa estar aqui, no layout do grupo de rotas, não na
// própria página.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
