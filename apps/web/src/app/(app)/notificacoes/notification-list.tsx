"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarNotificacaoLidaAction, marcarTodasNotificacoesLidasAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type NotificationItem = {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  lida: boolean;
  createdAt: string; // ISO
};

export function NotificationList({ notificacoes }: { notificacoes: NotificationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <div className="flex flex-col gap-3">
      {naoLidas > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await marcarTodasNotificacoesLidasAction();
              router.refresh();
            })
          }
        >
          Marcar todas como lidas ({naoLidas})
        </Button>
      )}

      {notificacoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma notificação ainda.</p>}

      {notificacoes.map((n) => (
        <div key={n.id} className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${n.lida ? "border-border/60 text-muted-foreground" : "border-border"}`}>
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-foreground">
              {n.titulo} {!n.lida && <Badge>Nova</Badge>}
            </p>
            <p>{n.corpo}</p>
            <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString("pt-BR")}</p>
          </div>
          {!n.lida && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await marcarNotificacaoLidaAction(n.id);
                  router.refresh();
                })
              }
            >
              Marcar como lida
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
