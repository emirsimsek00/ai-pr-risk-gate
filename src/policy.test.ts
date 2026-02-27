import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policy.js";

describe("policy engine", () => {
  it("blocks critical by default", () => {
    delete process.env.RISK_POLICIES_JSON;
    const decision = evaluatePolicy("any-repo", "critical");
    expect(decision.allowed).toBe(false);
  });

  it("allows low by default", () => {
    delete process.env.RISK_POLICIES_JSON;
    const decision = evaluatePolicy("any-repo", "low");
    expect(decision.allowed).toBe(true);
  });

  it("respects repo-specific threshold configuration", () => {
    process.env.RISK_POLICIES_JSON = JSON.stringify([
      { repo: "my-repo", blockAtOrAbove: "high" },
      { repo: "*", blockAtOrAbove: "critical" }
    ]);

    const blocked = evaluatePolicy("my-repo", "high");
    const allowed = evaluatePolicy("my-repo", "medium");

    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it("falls back to defaults when policy JSON is invalid", () => {
    process.env.RISK_POLICIES_JSON = "not-json";
    const decision = evaluatePolicy("any-repo", "critical");
    expect(decision.allowed).toBe(false);
  });
});
