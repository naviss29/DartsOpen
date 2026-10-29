import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

// Relecture courte et bornée de l'état du paiement sur la page de retour : jamais un
// interrogatoire sans fin si le webhook tarde, et un message clair une fois la borne atteinte.
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { PaymentConfirmationRefresh } from "./PaymentConfirmationRefresh";

beforeEach(() => {
  refreshMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PaymentConfirmationRefresh", () => {
  it("relit la page à intervalle régulier, puis s'arrête à la borne avec le message de lenteur", async () => {
    const { container } = render(<PaymentConfirmationRefresh slowMessage="Ça prend du temps" intervalMs={1000} maxAttempts={3} />);
    expect(container.textContent).toBe("");

    for (let i = 1; i <= 3; i++) {
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(refreshMock).toHaveBeenCalledTimes(i);
    }
    expect(container.textContent).toBe("Ça prend du temps");

    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(refreshMock).toHaveBeenCalledTimes(3);
  });

  it("démonté (inscription confirmée entre-temps) : plus aucune relecture", async () => {
    const { unmount } = render(<PaymentConfirmationRefresh slowMessage="x" intervalMs={1000} maxAttempts={5} />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    unmount();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("une relecture qui échoue est journalisée et n'arrête pas les suivantes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    refreshMock.mockImplementationOnce(() => { throw new Error("réseau"); });
    render(<PaymentConfirmationRefresh slowMessage="x" intervalMs={1000} maxAttempts={5} />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(refreshMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalled();
  });
});
