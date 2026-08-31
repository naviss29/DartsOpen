export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f8fafc",
        color: "#334155",
      }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: "20px" }}>
        <img
          src="/brand/dartsopen-logo-vertical.svg"
          alt="DartsOpen"
          style={{ width: "min(220px, 64vw)", height: "auto" }}
        />
        <span>Chargement…</span>
      </div>
    </main>
  );
}
