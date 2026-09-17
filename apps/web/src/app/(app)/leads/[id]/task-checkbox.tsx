"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarTaskConcluida } from "@/app/actions/leads";

export function TaskConcluidaCheckbox({ taskId, concluida }: { taskId: string; concluida: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      checked={concluida}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await alternarTaskConcluida(taskId, e.target.checked);
          router.refresh();
        })
      }
      className="h-4 w-4 rounded border-input"
    />
  );
}
