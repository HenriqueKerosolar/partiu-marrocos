/**
 * PM-CONV-08 — achado real (não teórico): valor monetário no schema é
 * `Float` (`Payment.valor`, `Proposal.preco`, `Commission.valor`, etc. —
 * convenção já estabelecida do projeto, documentada em `schema.prisma`).
 * Comparar dois floats somados por caminhos diferentes com `>=`/`===`
 * direto é inseguro: `2.55 + 2.56 === 5.11` é `false` em IEEE754 (erro de
 * representação binária de fração decimal) — reproduzido nesta rodada com
 * um parcelamento realista de 2 parcelas (R$ 2,55 + R$ 2,56), que soma
 * `5.109999999999999`, não `5.11`. Isso já causava um bug real em
 * produção: `sincronizarStatusPagamentoBooking` (`payment.ts`) comparava
 * `totalPago >= proposal.preco` direto — um cliente que pagasse o valor
 * EXATO em parcelas "quebradas" podia nunca ver o Booking virar PAGO.
 *
 * Correção cirúrgica (não uma migração Decimal completa — ver justificativa
 * no relatório PM-CONV-08): todo valor monetário usado nas duas moedas reais
 * do projeto hoje (BRL/EUR, sempre 2 casas decimais) é comparado em
 * CENTAVOS (inteiro), nunca como float fracionário direto. Isso elimina a
 * classe inteira de erro de arredondamento nas comparações sem trocar o
 * tipo de armazenamento, sem migration, sem alterar a serialização já
 * usada por toda a suíte de testes existente.
 */

const CENTAVOS_POR_UNIDADE = 100;

/** Converte um valor monetário (ex.: 5.11) para centavos inteiros (511), arredondando o erro de representação de float — nunca usar o valor fracionário direto numa comparação. */
export function paraCentavos(valor: number): number {
  return Math.round(valor * CENTAVOS_POR_UNIDADE);
}

/** `a >= b`, seguro contra erro de ponto flutuante (compara em centavos, não a fração direto). */
export function valorMaiorOuIgual(a: number, b: number): boolean {
  return paraCentavos(a) >= paraCentavos(b);
}

/** `a > b`, seguro contra erro de ponto flutuante. */
export function valorMaior(a: number, b: number): boolean {
  return paraCentavos(a) > paraCentavos(b);
}
