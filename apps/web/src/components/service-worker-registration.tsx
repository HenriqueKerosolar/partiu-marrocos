"use client";

import { useEffect } from "react";

/** PM-CONV-05, Track B — registra o service worker uma vez, client-side (nunca durante SSR). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registro de SW é melhor-esforço — se falhar (ex.: browser sem suporte, contexto não seguro), o app continua funcionando normalmente sem PWA.
    });
  }, []);
  return null;
}
