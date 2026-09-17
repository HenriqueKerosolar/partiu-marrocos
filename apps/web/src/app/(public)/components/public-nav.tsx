import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { href: "#roteiros", label: "Roteiros" },
  { href: "#amazigh", label: "Universo amazigh" },
  { href: "#sabores", label: "Sabores do Marrocos" },
  { href: "#reservar", label: "Comprar pacote" },
];

export function PublicNav() {
  return (
    <header className="sticky top-0 z-30">
      <div className="flex items-center justify-between gap-4 bg-[#EDE4D3] px-6 py-3 text-[#0D2140] sm:px-10">
        <div className="flex items-center gap-3">
          <Image src="/img/logo.png" alt="Partiu Marrocos" width={44} height={44} className="h-11 w-11 object-contain" />
          <div className="leading-tight">
            <div className="font-[family-name:var(--font-fraunces)] text-lg font-semibold">Sua viagem,</div>
            <div className="font-[family-name:var(--font-fraunces)] text-lg italic text-[#D24E1C]">por inteiro.</div>
          </div>
        </div>
        <Link
          href="/login"
          className="rounded-full bg-[#F2A93B] px-5 py-2 text-sm font-semibold text-[#0D2140] transition hover:bg-[#F8C972]"
        >
          Entrar
        </Link>
      </div>
      <nav className="flex flex-wrap items-center gap-6 bg-[#0D2140] px-6 py-3 text-sm text-[#EDE4D3]/80 sm:px-10">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="transition hover:text-[#F2A93B]">
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
