import { describe, expect, it } from "vitest";
import { lerPreferencia, resolver } from "../src/tema/tema";

describe("tema claro/escuro", () => {
  it("a escolha explícita vence o sistema; 'sistema' segue o aparelho", () => {
    expect(resolver("claro", true)).toBe("claro");
    expect(resolver("escuro", false)).toBe("escuro");
    expect(resolver("sistema", true)).toBe("escuro");
    expect(resolver("sistema", false)).toBe("claro");
  });

  it("sem armazenamento disponível, cai em 'sistema' sem erro", () => {
    expect(lerPreferencia()).toBe("sistema");
  });
});
