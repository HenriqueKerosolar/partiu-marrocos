import type { Metadata } from "next";
import { PublicNav } from "../components/public-nav";
import { AmazighScene } from "../components/amazigh-scene";
import { Contact } from "../components/contact";
import { Footer } from "../components/footer";
import { SiteHelp } from "../components/site-help";

export const metadata: Metadata = { title: "Universo amazigh · Partiu Marrocos" };

// Réplica de sectionPage('amazigh', data) em public-site.js: <h1> + a mesma
// seção amazigh() da home + cta() + footer().
export default function UniversoAmazighPage() {
  return (
    <>
      <PublicNav active="amazigh" />
      <div className="public-editorial editorial-inner" data-public-landing>
        <h1 className="editorial-page-title">Universo amazigh</h1>
        <AmazighScene />
        <Contact />
        <Footer />
        <SiteHelp />
      </div>
    </>
  );
}
