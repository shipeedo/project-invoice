import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROCESSING_CONCURRENCY,
  resolveProcessingConcurrency,
} from "@/lib/processing-queue";

describe("resolveProcessingConcurrency", () => {
  it("defaults to 1 when unset or blank", () => {
    expect(DEFAULT_PROCESSING_CONCURRENCY).toBe(1);
    expect(resolveProcessingConcurrency(undefined)).toBe(1);
    expect(resolveProcessingConcurrency("")).toBe(1);
    expect(resolveProcessingConcurrency("  ")).toBe(1);
  });

  it("parses a configured value", () => {
    expect(resolveProcessingConcurrency("3")).toBe(3);
    expect(resolveProcessingConcurrency(" 5 ")).toBe(5);
  });

  it("rejects garbage and out-of-range values", () => {
    expect(resolveProcessingConcurrency("zero")).toBe(1);
    expect(resolveProcessingConcurrency("0")).toBe(1);
    expect(resolveProcessingConcurrency("-2")).toBe(1);
    expect(resolveProcessingConcurrency("250")).toBe(10);
  });
});
