import { describe, expect, it } from "vitest";
import { PLATFORM_FEE_CENTS } from "./platformFee";

describe("PLATFORM_FEE_CENTS", () => {
  it("reste à 0 : aucune commission BApps sur une inscription (ADR-0022)", () => {
    // Une valeur non nulle deviendrait une commission prélevée sur l'argent de l'organisation,
    // interdite par ADR-0022 (l'argent des ventes va directement à l'organisation).
    expect(PLATFORM_FEE_CENTS).toBe(0);
  });
});
