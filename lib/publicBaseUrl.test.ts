import { afterEach, describe, expect, it } from "vitest";
import { publicBaseUrl } from "./publicBaseUrl";

const avant = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = avant;
});

describe("publicBaseUrl", () => {
  it("utilise l'adresse publique, jamais l'adresse interne du conteneur", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://dartsopen.example.test";
    const url = new URL("/t/abc/score", publicBaseUrl("https://localhost:3000/t/abc/field?board=1"));
    expect(url.toString()).toBe("https://dartsopen.example.test/t/abc/score");
  });

  it("retombe sur l'URL de la requête si la variable manque (développement local)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "";
    const url = new URL("/t/abc/score", publicBaseUrl("http://localhost:3000/t/abc/field"));
    expect(url.toString()).toBe("http://localhost:3000/t/abc/score");
  });
});
