"use client";

import Image from "next/image";
import { useState } from "react";
import { amazigh, sabores } from "@/lib/public-site-data";

type Tab = "amazigh" | "sabores";

export function AmazighSabores() {
  const [tab, setTab] = useState<Tab>("amazigh");

  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:px-10" id="amazigh">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#F2A93B]">Para conhecer mais</p>
          <h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-semibold sm:text-3xl">As histórias e os sabores da viagem.</h2>
        </div>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <button
            onClick={() => setTab("amazigh")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "amazigh" ? "bg-[#F2A93B] text-[#0D2140]" : "border border-[#EDE4D3]/30 text-[#EDE4D3]"}`}
          >
            Universo amazigh
          </button>
          <button
            onClick={() => setTab("sabores")}
            id="sabores"
            className={`scroll-mt-24 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "sabores" ? "bg-[#F2A93B] text-[#0D2140]" : "border border-[#EDE4D3]/30 text-[#EDE4D3]"}`}
          >
            Sabores do Marrocos
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2 sm:hidden">
        <button
          onClick={() => setTab("amazigh")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "amazigh" ? "bg-[#F2A93B] text-[#0D2140]" : "border border-[#EDE4D3]/30 text-[#EDE4D3]"}`}
        >
          Universo amazigh
        </button>
        <button
          onClick={() => setTab("sabores")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "sabores" ? "bg-[#F2A93B] text-[#0D2140]" : "border border-[#EDE4D3]/30 text-[#EDE4D3]"}`}
        >
          Sabores do Marrocos
        </button>
      </div>

      {tab === "amazigh" ? (
        <div className="mt-8">
          <div className="grid overflow-hidden rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] sm:grid-cols-2">
            <div className="p-6 sm:p-8">
              <p className="text-xs uppercase tracking-wide text-[#F2A93B]">{amazigh.kicker}</p>
              <h3 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold sm:text-3xl">
                {amazigh.titulo} <span className="italic text-[#F2A93B]">{amazigh.tituloItalico}</span>
              </h3>
              <p className="mt-3 text-sm text-[#EDE4D3]/75">{amazigh.subtitle}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href="#roteiros" className="rounded-full bg-[#F2A93B] px-5 py-2 text-sm font-semibold text-[#0D2140] hover:bg-[#F8C972]">
                  Conhecer Merzouga
                </a>
                <button onClick={() => setTab("sabores")} className="rounded-full border border-[#EDE4D3]/30 px-5 py-2 text-sm font-semibold text-[#EDE4D3]">
                  Sabores do Marrocos
                </button>
              </div>
            </div>
            <div className="relative h-56 sm:h-auto">
              <Image src={amazigh.img} alt={amazigh.imgCaption} fill className="object-cover" />
              <span className="absolute bottom-3 left-3 rounded-full bg-[#06080F]/70 px-3 py-1 text-xs text-[#EDE4D3]">{amazigh.imgCaption}</span>
            </div>
          </div>

          <div className="mt-6 border-t border-[#EDE4D3]/10 pt-6">
            <span className="text-xs text-[#F2A93B]">{amazigh.destaque.numero} · {amazigh.destaque.tag}</span>
            <h4 className="mt-1 font-[family-name:var(--font-fraunces)] text-xl font-semibold">{amazigh.destaque.titulo}</h4>
            <p className="mt-2 max-w-2xl text-sm text-[#EDE4D3]/70">{amazigh.destaque.texto}</p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {amazigh.historias.map((h) => (
              <div key={h.numero} className="rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] p-5">
                <span className="text-xs text-[#F2A93B]">{h.numero} · {h.tag}</span>
                <h5 className="mt-1 font-semibold text-[#EDE4D3]">{h.titulo}</h5>
                <p className="mt-1 text-xs text-[#EDE4D3]/65">{h.d}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <div className="grid overflow-hidden rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C] sm:grid-cols-2">
            <div className="p-6 sm:p-8">
              <p className="text-xs uppercase tracking-wide text-[#F2A93B]">{sabores.kicker}</p>
              <h3 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl font-semibold sm:text-3xl">
                {sabores.titulo} <span className="italic text-[#F2A93B]">{sabores.tituloItalico}</span>
              </h3>
              <p className="mt-3 text-sm text-[#EDE4D3]/75">{sabores.subtitle}</p>
            </div>
            <div className="relative h-56 sm:h-auto">
              <Image src={sabores.img} alt={sabores.imgCaption} fill className="object-cover" />
              <span className="absolute bottom-3 left-3 rounded-full bg-[#06080F]/70 px-3 py-1 text-xs text-[#EDE4D3]">{sabores.imgCaption}</span>
            </div>
          </div>

          <div className="mt-6 border-t border-[#EDE4D3]/10 pt-6">
            <span className="text-xs text-[#F2A93B]">{sabores.editorial.kicker}</span>
            <h4 className="mt-1 font-[family-name:var(--font-fraunces)] text-xl font-semibold">{sabores.editorial.titulo}</h4>
            <p className="mt-2 max-w-2xl text-sm text-[#EDE4D3]/70">{sabores.editorial.texto}</p>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-[#EDE4D3]">Para cozinhar em casa</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {sabores.receitas.map((r) => (
                <div key={r.t} className="overflow-hidden rounded-2xl border border-[#EDE4D3]/15 bg-[#0A0F1C]">
                  <div className="relative h-28 w-full">
                    <Image src={r.img} alt={r.t} fill className="object-cover" />
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] uppercase tracking-wide text-[#EDE4D3]/50">{r.tempo}</p>
                    <p className="mt-1 font-semibold text-[#EDE4D3]">{r.t}</p>
                    <p className="mt-1 text-xs text-[#EDE4D3]/65">{r.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
