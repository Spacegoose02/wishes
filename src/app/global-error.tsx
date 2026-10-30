"use client";
import "./globals.css";

// Last-resort screen when the root layout itself fails.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="system">
      <body>
        <main className="shell">
          <div className="empty" style={{ marginTop: 80 }}>
            <div className="big" aria-hidden="true">🦝</div>
            <h1>Wishes hit a snag</h1>
            <p>Something went wrong loading the app. Give it another go.</p>
            <button type="button" className="btn" onClick={reset}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
