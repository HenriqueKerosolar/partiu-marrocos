// Existe só para satisfazer a geração interna do Next.js dos HTMLs estáticos
// de fallback /404 e /500 — bug conhecido do Next 14.2.x onde essa etapa
// quebra ("<Html> should not be imported outside of pages/_document") em
// projetos 100% App Router sem nenhum arquivo em pages/. O tratamento real
// de 404 em runtime continua sendo src/app/not-found.tsx; este arquivo nunca
// é servido em uso normal.
import type { NextPageContext } from "next";

function Error({ statusCode }: { statusCode?: number }) {
  return <p>{statusCode ? `Erro ${statusCode}` : "Ocorreu um erro"}</p>;
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
