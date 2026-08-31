import Image from "next/image";

export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="grid min-h-[calc(100dvh-64px)] place-items-center bg-surface p-6 text-secondary"
    >
      <div className="grid justify-items-center gap-5">
        <Image
          src="/brand/dartsopen-logo-vertical.svg"
          alt="DartsOpen"
          width={220}
          height={220}
          className="h-auto w-full max-w-[220px]"
          priority
        />
        <span>Chargement…</span>
      </div>
    </main>
  );
}
