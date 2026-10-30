import { describe, it, expect } from "vitest";
import { maskEmail } from "./maskEmail";

describe("maskEmail", () => {
  it("garde la première lettre et le domaine seulement", () => {
    expect(maskEmail("alan@exemple.fr")).toBe("a***@exemple.fr");
    expect(maskEmail(" éloïse@club.fr ")).toBe("é***@club.fr");
    expect(maskEmail("a@b@exemple.fr")).toBe("a***@exemple.fr");
  });

  it("ne laisse rien fuir d'une valeur qui n'est pas une adresse", () => {
    expect(maskEmail("pas-une-adresse")).toBe("***");
    expect(maskEmail("@exemple.fr")).toBe("***");
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
    expect(maskEmail(undefined)).toBe("");
  });
});
