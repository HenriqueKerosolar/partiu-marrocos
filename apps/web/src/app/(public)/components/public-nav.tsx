import Link from "next/link";

const NAV_LINKS: [string, string, string][] = [
  ["/", "Descobrir", "home"],
  ["#site-inspirations", "Pacotes", "offers"],
  ["#site-destinations", "Destinos", "destinations"],
  ["#site-experiences", "Experiências", "experiences"],
  ["/universo-amazigh", "Universo amazigh", "amazigh"],
  ["/sabores-do-marrocos", "Sabores do Marrocos", "food"],
  ["#site-faq", "Na prática", "essentials"],
];

// Réplica literal de <header class="brand-header"> + nav(view) em
// public-site.js — estrutura e valores conferidos ao vivo (getComputedStyle)
// em 127.0.0.1:8080 (o pacote php74 0.4.11 rodando), não inventados.
//
// Âncoras (#site-x) usam <a> normal, não next/link: o Link do Next não
// dispara o scroll nativo do navegador quando o hash muda na MESMA rota (só
// atualiza a URL) — reportado pelo usuário ("os botões não fazem nada").
// `onHome` diz se a página atual É a home (onde as seções existem); fora
// dela, a âncora precisa apontar pra "/#site-x" (navegação real de página).
export function PublicNav({ active = "home", onHome = true }: { active?: string; onHome?: boolean }) {
  return (
    <>
      <header className="brand-header">
        <Link href="/" className="brand">
          <img src="/img/logo.png" alt="Partiu Marrocos" />
          <span>
            Sua viagem,
            <em>por inteiro.</em>
          </span>
        </Link>
        <div className="header-links">
          <a href={onHome ? "#site-inspirations" : "/#site-inspirations"}>Pacotes</a>
          <Link href="/universo-amazigh">Universo amazigh</Link>
          <a className="header-contact" href={onHome ? "#site-contact" : "/#site-contact"}>
            Atendimento
          </a>
        </div>
        <div className="account">
          <select aria-label="Idioma" defaultValue="pt">
            <option value="pt">PT</option>
            <option value="en">EN</option>
            <option value="es">ES</option>
            <option value="fr">FR</option>
          </select>
          <a className="btn small" href="/login">
            Entrar
          </a>
        </div>
      </header>
      <nav className="public-nav" aria-label="Navegação do site">
        {NAV_LINKS.map(([href, label, id]) =>
          href.startsWith("#") ? (
            <a key={href} href={onHome ? href : `/${href}`} aria-current={id === active ? "page" : undefined}>
              {label}
            </a>
          ) : (
            <Link key={href} href={href} aria-current={id === active ? "page" : undefined}>
              {label}
            </Link>
          ),
        )}
      </nav>
    </>
  );
}
