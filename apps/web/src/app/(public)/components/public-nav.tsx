import Link from "next/link";

const NAV_LINKS: [string, string, string][] = [
  ["/", "Descobrir", "home"],
  ["/#site-inspirations", "Pacotes", "offers"],
  ["/#site-destinations", "Destinos", "destinations"],
  ["/#site-experiences", "Experiências", "experiences"],
  ["/universo-amazigh", "Universo amazigh", "amazigh"],
  ["/sabores-do-marrocos", "Sabores do Marrocos", "food"],
  ["/#site-faq", "Na prática", "essentials"],
];

// Réplica literal de <header class="brand-header"> + nav(view) em
// public-site.js — estrutura e valores conferidos ao vivo (getComputedStyle)
// em 127.0.0.1:8080 (o pacote php74 0.4.11 rodando), não inventados.
export function PublicNav({ active = "home" }: { active?: string }) {
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
          <Link href="/#site-inspirations">Pacotes</Link>
          <Link href="/universo-amazigh">Universo amazigh</Link>
          <a className="header-contact" href="/#site-contact">
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
        {NAV_LINKS.map(([href, label, id]) => (
          <Link key={href} href={href} aria-current={id === active ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
