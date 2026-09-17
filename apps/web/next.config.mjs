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
};

export default nextConfig;
