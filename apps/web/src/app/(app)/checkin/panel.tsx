"use client";

import { useState, useTransition } from "react";
import { validarCredencialAction, confirmarCheckInAction, confirmarEmbarqueAction, type CredencialInfo } from "@/app/actions/checkin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = { AGENDADO: "Agendado", CHECKIN_REALIZADO: "Check-in realizado", EMBARCADO: "Embarcado", NO_SHOW: "Não compareceu", CANCELADO: "Cancelado" };

export function CheckInPanel({ tokenInicial, podeExecutarCheckin, podeExecutarEmbarque }: { tokenInicial: string; podeExecutarCheckin: boolean; podeExecutarEmbarque: boolean }) {
  const [token, setToken] = useState(tokenInicial);
  const [info, setInfo] = useState<CredencialInfo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function validar() {
    setErro(null);
    setMensagem(null);
    startTransition(async () => {
      const r = await validarCredencialAction(token.trim());
      if (r.error) {
        setErro(r.error);
        setInfo(null);
        return;
      }
      setInfo(r.info ?? null);
    });
  }

  function executarCheckIn() {
    startTransition(async () => {
      const r = await confirmarCheckInAction(token.trim());
      if (r.error) {
        setErro(r.error);
        return;
      }
      setMensagem("Check-in confirmado.");
      validar();
    });
  }

  function executarEmbarque() {
    startTransition(async () => {
      const r = await confirmarEmbarqueAction(token.trim());
      if (r.error) {
        setErro(r.error);
        return;
      }
      setMensagem("Embarque confirmado.");
      validar();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Código da credencial" className="w-72 font-mono text-xs" />
        <Button size="sm" onClick={validar} disabled={pending || !token.trim()}>
          Validar
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {mensagem && <p className="text-sm text-primary">{mensagem}</p>}

      {info && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          <p className="font-medium">
            {info.travelerNome} <Badge>{STATUS_LABEL[info.status] ?? info.status}</Badge>
          </p>
          <p className="text-xs text-muted-foreground">Grupo: {info.tripGroupNome}</p>
          <div className="flex gap-2">
            {podeExecutarCheckin && info.status === "AGENDADO" && (
              <Button size="sm" disabled={pending} onClick={executarCheckIn}>
                Confirmar check-in
              </Button>
            )}
            {podeExecutarEmbarque && info.status === "CHECKIN_REALIZADO" && (
              <Button size="sm" disabled={pending} onClick={executarEmbarque}>
                Confirmar embarque
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
