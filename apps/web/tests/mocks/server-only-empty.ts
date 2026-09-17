// Stub de teste para o pacote "server-only" — em produção/Next.js real, o
// bundler troca esse import por um guard que lança fora de Server
// Component; em Vitest puro (node, sem o bundler da Next) ele sempre
// lançaria. Este arquivo substitui só no ambiente de teste (ver
// vitest.config.ts), sem tocar em nenhum guard de produção.
export {};
