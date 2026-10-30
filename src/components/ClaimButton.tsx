"use client";
import { useOptimistic, useTransition } from "react";

// "I'll get it" / "Unclaim" that flips instantly while the server catches up.
export function ClaimButton({ itemId, claimed, action }: { itemId: number; claimed: boolean; action: (f: FormData) => Promise<void> }) {
  const [optimistic, setOptimistic] = useOptimistic(claimed);
  const [, start] = useTransition();
  return (
    <form
      action={(f) =>
        start(async () => {
          setOptimistic(!optimistic);
          await action(f);
        })
      }
    >
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="action" value={optimistic ? "unclaim" : "claim"} />
      <button className={`btn small${optimistic ? " ghost" : ""}`} aria-pressed={optimistic}>
        {optimistic ? "Unclaim" : "I'll get it"}
      </button>
    </form>
  );
}
