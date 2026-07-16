const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["OPEN"],
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["FINISHED"],
  FINISHED: [],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transition de statut invalide : ${from} → ${to}`);
  }
}
