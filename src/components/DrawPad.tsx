"use client";
import { useRef, useState } from "react";

const COLORS = ["#222222", "#e63946", "#f4a261", "#f5c400", "#2a9d8f", "#3a86ff", "#8338ec", "#ff70a6"];

// A little canvas to draw a wish on. The drawing goes to the server as a PNG data URL
// in a hidden "drawing" field.
export function DrawPad({ name = "drawing", size = 320 }: { name?: string; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [data, setData] = useState("");

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size * 0.75 };
  }
  function line(to: { x: number; y: number }) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const from = last.current ?? to;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    last.current = to;
  }
  function clear() {
    const ctx = canvas.current?.getContext("2d");
    ctx?.clearRect(0, 0, size, size);
    setData("");
  }

  return (
    <div className="drawpad">
      <canvas
        ref={canvas}
        width={size}
        height={size * 0.75}
        aria-label="Drawing area"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = null; line(point(e)); }}
        onPointerMove={(e) => { if (e.buttons) line(point(e)); }}
        onPointerUp={() => {
          last.current = null;
          // Draw onto white so the PNG isn't transparent in dark themes.
          const c = canvas.current;
          if (!c) return;
          const out = document.createElement("canvas");
          out.width = c.width;
          out.height = c.height;
          const ctx = out.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, out.width, out.height);
          ctx.drawImage(c, 0, 0);
          setData(out.toDataURL("image/png"));
        }}
      />
      <div className="row gap-6 mt-6">
        {COLORS.map((c) => (
          <button key={c} type="button" className={`swatch${c === color ? " on" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} />
        ))}
        <button type="button" className="btn small ghost" onClick={clear}>Clear</button>
      </div>
      <input type="hidden" name={name} value={data} />
    </div>
  );
}
