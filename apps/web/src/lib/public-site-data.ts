// Conteúdo real do site público, portado literalmente de
// partiumarrocos.com.br-php74-0.4.11/app/editorial-data.js (editorial.ts do
// pacote PHP7.4 + Firebase) — é a fonte correta e mais completa do site
// público, não a prévia simplificada usada antes. Ver public-site-editorial.json.
import raw from "./public-site-editorial.json";

export type Stat = { n: string; suf: string; l: string };
export type Hero = { kicker: string; partiu: string; titulo: string; oIndex: number; subtitle: string; stats: Stat[]; img: string };
export type Take = { t: string; d: string };
export type Trailer = { lines: string[]; takes: Take[] };
export type Destino = { key: string; k: string; t: string; img: string; strip: boolean; cap: string; sub: string; d: string; f: string[] };
export type RoteiroDia = { n: string; t: string; d: string; chips: string[] };
export type RotaStop = { n: string; s: string };
export type Pacote = {
  id: string; emoji: string; cat: string; dias: string; noites: string; ep: string; nome: string; sub: string;
  sinopse: string; inc: string[]; preco: string; featured: boolean; badge?: string; img: string;
  roteiro: RoteiroDia[]; rota: { km: number; stops: RotaStop[] };
};
export type Experiencia = { tk: string; img: string; t: string; d: string };
export type Prato = { img: string; t: string; d: string };
export type Peek = { k: string; t: string; img: string };
export type Fato = { i: string; t: string; d: string };
export type Quote = { p: string; a: string; s: string };
export type Elenco = { av: string; role: string; t: string; d: string };
export type Faq = { q: string; a: string; source?: string };
export type AlmaStat = { b: string; n: number; suf: string; s: string };
export type Alma = { paras: string[]; quote: string; stats: AlmaStat[] };

export type Editorial = {
  hero: Hero;
  trailer: Trailer;
  destinos: Destino[];
  pacotes: Pacote[];
  experiencias: Experiencia[];
  pratos: Prato[];
  peeks: Peek[];
  fatos: Fato[];
  quotes: Quote[];
  elenco: Elenco[];
  faq: Faq[];
  alma: Alma;
};

export const editorial = raw as unknown as Editorial;

export const contato = {
  whatsapp: "5599999999999",
  email: "info@partiumarrocos.com.br",
  instagram: "#",
};
