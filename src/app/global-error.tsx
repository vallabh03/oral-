"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>
        <button type="button" onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
