"use client";
import { useRef, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

type Row = { id: number; title: string; image: string; icon: string; must: boolean };

// Drag wishes into order (mouse or finger), or use the arrow buttons from the keyboard.
export function RankList({ rows, action, listId }: { rows: Row[]; action: (f: FormData) => void | Promise<void>; listId: number }) {
  const [order, setOrder] = useState(rows);
  const [dragging, setDragging] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((o) => {
      const next = [...o];
      const [r] = next.splice(from, 1);
      next.splice(to, 0, r);
      return next;
    });
  }

  function onPointerDown(e: React.PointerEvent, id: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(id);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging === null || !listRef.current) return;
    const items = [...listRef.current.querySelectorAll<HTMLElement>("[data-rank-row]")];
    const from = order.findIndex((r) => r.id === dragging);
    // The row under the finger: the first one whose middle is below it.
    let to = items.findIndex((el) => {
      const b = el.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    if (to === -1) to = items.length - 1;
    else if (to > from) to -= 1;
    if (to !== from) move(from, to);
  }

  function onPointerUp() {
    if (dragging === null) return;
    const pos = order.findIndex((r) => r.id === dragging) + 1;
    setSaid(`${order[pos - 1]?.title} moved to number ${pos}`);
    setDragging(null);
  }

  return (
    <form action={action} className="stack">
      <input type="hidden" name="list_id" value={listId} />
      <input type="hidden" name="order" value={order.map((r) => r.id).join(",")} />
      <ol ref={listRef} className="rank-list" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {order.map((r, i) => (
          <li key={r.id} data-rank-row className={`card rank-row${dragging === r.id ? " dragging" : ""}`}>
            <span
              className="rank-handle"
              onPointerDown={(e) => onPointerDown(e, r.id)}
              aria-hidden="true"
              title="Drag to move"
            >
              ⠿
            </span>
            <span className="rank-num">{i + 1}</span>
            <span className="rank-img" aria-hidden="true">{r.image ? <img src={r.image} alt="" referrerPolicy="no-referrer" loading="lazy" /> : r.icon}</span>
            <span className="grow min-0 fw-700">{r.must ? "⭐ " : ""}{r.title}</span>
            <button type="button" className="btn small ghost" aria-label={`Move ${r.title} up`} disabled={i === 0} onClick={() => { move(i, i - 1); setSaid(`${r.title} moved to number ${i}`); }}>↑</button>
            <button type="button" className="btn small ghost" aria-label={`Move ${r.title} down`} disabled={i === order.length - 1} onClick={() => { move(i, i + 1); setSaid(`${r.title} moved to number ${i + 2}`); }}>↓</button>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{said}</p>
      <div className="row gap-6">
        <SubmitButton className="btn">Save this order</SubmitButton>
        <SubmitButton className="btn ghost" name="clear" value="1" confirm="Tap again to go back to sorting by stars">Clear my order</SubmitButton>
      </div>
    </form>
  );
}
