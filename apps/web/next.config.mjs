/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@partiumarrocos/db"],
  // PM-PRE-GOLIVE-MASTER-01 — achado real de deploy, confirmado pela mensagem
  // de erro da própria Prisma em produção: o rastreador de arquivos do
  // Next.js (usado pra empacotar cada função serverless) não inclui por
  // padrão o binário do Query Engine do Prisma quando ele vive dentro do
  // node_modules/.pnpm hoisted de um monorepo — a query engine é gerada
  // certinha (`prisma generate` roda sem erro, com o `binaryTargets` certo),
  // mas nunca chega no pacote da função. Padrão oficial recomendado pela
  // própria Prisma para Next.js + pnpm monorepo + Vercel.
  experimental: {
    outputFileTracingIncludes: {
      "/**/*": ["../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*"],
    },
  },
  // Vercel "Multi Zones": o site público (site-original/partiumarrocos.com.br,
  // deploy estático separado) e o CRM (este app) precisam parecer "uma coisa
  // só" no mesmo domínio — o cliente troca entre o site e as ferramentas do
  // CRM (mensagens, GPS) sem perceber que são dois deploys. O CRM é o dono do
  // domínio e reescreve as rotas do site público para o outro deployment.
  async rewrites() {
    const SITE_ORIGIN = process.env.PUBLIC_SITE_DEPLOYMENT_URL ?? "https://partiu-marrocos-site.vercel.app";
    const marketingRewrites = [
      { source: "/", destination: `${SITE_ORIGIN}/` },
      { source: "/mapa", destination: `${SITE_ORIGIN}/mapa.html` },
      { source: "/mapa.html", destination: `${SITE_ORIGIN}/mapa.html` },
      { source: "/css/:path*", destination: `${SITE_ORIGIN}/css/:path*` },
      { source: "/js/:path*", destination: `${SITE_ORIGIN}/js/:path*` },
      { source: "/img/:path*", destination: `${SITE_ORIGIN}/img/:path*` },
      { source: "/cinema/:path*", destination: `${SITE_ORIGIN}/cinema/:path*` },
    ];
    // Achado real: a forma "array simples" de rewrites só roda DEPOIS das
    // rotas do próprio filesystem (pages/app router) — e este app já tem uma
    // page em "/" (redireciona pro /dashboard), que sempre ganharia da
    // reescrita. `beforeFiles` roda antes disso, então "/" some do próprio
    // app e passa a pertencer de verdade ao site público.
    return { beforeFiles: marketingRewrites };
  },
};

export default nextConfig;
