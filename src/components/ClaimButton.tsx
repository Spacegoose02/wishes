"use client";
import { useOptimistic, useTransition } from "react";

// "I'll get it" / "Unclaim" that flips instantly while the server catches up.
// `from` is the list being looked at, when a shared wish lives on a sibling's list.
export function ClaimButton({ itemId, claimed, action, from }: { itemId: number; claimed: boolean; action: (f: FormData) => Promise<void>; from?: number }) {
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
      {from ? <input type="hidden" name="from" value={from} /> : null}
      <input type="hidden" name="action" value={optimistic ? "unclaim" : "claim"} />
      <button className={`btn small${optimistic ? " ghost" : ""}`} aria-pressed={optimistic}>
        {optimistic ? "Unclaim" : "I'll get it"}
      </button>
    </form>
  );
}
