import type { Metadata } from "next";
import { PublicNav } from "../components/public-nav";
import { FoodScene } from "../components/food-scene";
import { Contact } from "../components/contact";
import { Footer } from "../components/footer";
import { SiteHelp } from "../components/site-help";

export const metadata: Metadata = { title: "Sabores do Marrocos · Partiu Marrocos" };

// Réplica de sectionPage('food', data) em public-site.js: <h1> + food(true)
// (sem o link "Explorar sabores e receitas", que levaria a esta própria
// página) + cta() + footer().
export default function SaboresDoMarrocosPage() {
  return (
    <>
      <PublicNav active="food" />
      <div className="public-editorial editorial-inner" data-public-landing>
        <h1 className="editorial-page-title">Sabores do Marrocos</h1>
        <FoodScene full />
        <Contact />
        <Footer />
        <SiteHelp />
      </div>
    </>
  );
}
