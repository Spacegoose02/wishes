export default function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="skeleton skeleton-title" />
      <div className="grid">
        {[0, 1, 2].map((i) => <div key={i} className="card skeleton skeleton-card" />)}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
