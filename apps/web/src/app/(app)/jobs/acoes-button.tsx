"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarJobAction, reenviarJobAction } from "@/app/actions/jobs";
import { Button } from "@/components/ui/button";

export function CancelarJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function onCancelar() {
    if (!window.confirm("Cancelar este job?")) return;
    setEnviando(true);
    try {
      await cancelarJobAction(jobId);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={enviando} onClick={onCancelar} className="text-destructive">
      Cancelar
    </Button>
  );
}

export function ReenviarJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function onReenviar() {
    setEnviando(true);
    try {
      await reenviarJobAction(jobId);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={enviando} onClick={onReenviar}>
      Reenviar
    </Button>
  );
}
