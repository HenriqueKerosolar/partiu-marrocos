"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { responderTicketAction } from "@/app/actions/support";
import { Button } from "@/components/ui/button";

export function ResponderForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2"
      action={(formData) =>
        startTransition(async () => {
          await responderTicketAction(ticketId, formData);
          formRef.current?.reset();
          router.refresh();
        })
      }
    >
      <textarea name="corpo" required rows={2} placeholder="Escrever resposta..." className="rounded-md border border-input bg-background p-2 text-sm" />
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        Responder
      </Button>
    </form>
  );
}
