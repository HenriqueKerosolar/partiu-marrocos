import { PublicNav } from "./components/public-nav";
import { PropostaBanner } from "./components/proposta-banner";
import { Hero } from "./components/hero";
import { Highlights } from "./components/highlights";
import { Roteiros } from "./components/roteiros";
import { Accompaniment } from "./components/accompaniment";
import { AmazighSabores } from "./components/amazigh-sabores";
import { QuotesFaq } from "./components/quotes-faq";
import { Footer } from "./components/footer";

export default function PublicHomePage() {
  return (
    <>
      <PublicNav />
      <main>
        <PropostaBanner />
        <Hero />
        <Highlights />
        <Roteiros />
        <Accompaniment />
        <AmazighSabores />
        <QuotesFaq />
      </main>
      <Footer />
    </>
  );
}
