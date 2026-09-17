import { faq, quotes } from "@/lib/public-site-data";

export function QuotesFaq() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold sm:text-3xl">Quem viajou, conta.</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {quotes.map((quote) => (
          <blockquote key={quote.a} className="rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] p-5 text-sm">
            <p className="italic text-[#EDE4D3]/85">&ldquo;{quote.p}&rdquo;</p>
            <footer className="mt-3 text-xs text-[#F2A93B]">
              {quote.a} <span className="text-[#EDE4D3]/50">· {quote.s}</span>
            </footer>
          </blockquote>
        ))}
      </div>

      <h2 className="mt-16 font-[family-name:var(--font-fraunces)] text-2xl font-semibold sm:text-3xl" id="na-pratica">
        Na prática
      </h2>
      <div className="mt-6 divide-y divide-[#EDE4D3]/10 rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C]">
        {faq.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="cursor-pointer list-none font-semibold text-[#EDE4D3] marker:content-none">
              {item.q}
            </summary>
            <p className="mt-2 text-sm text-[#EDE4D3]/70">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
