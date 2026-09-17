import { jornada } from "@/lib/public-site-data";

export function Highlights() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <div className="grid gap-x-10 gap-y-6 border-t border-[#EDE4D3]/15 pt-6 sm:grid-cols-3">
        {jornada.map((item, i) => (
          <div key={item.t}>
            <span className="text-xs text-[#F2A93B]">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-1 font-semibold text-[#EDE4D3]">{item.t}</h3>
            <p className="mt-1 text-sm text-[#EDE4D3]/70">{item.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
