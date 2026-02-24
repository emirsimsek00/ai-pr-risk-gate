import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policy.js";

describe("policy engine", () => {
  it("blocks critical by default", () => {
    const decision = evaluatePolicy("any-repo", "critical");
    expect(decision.allowed).toBe(false);
  });

  it("allows low by default", () => {
    const decision = evaluatePolicy("any-repo", "low");
    expect(decision.allowed).toBe(true);
  });
});
