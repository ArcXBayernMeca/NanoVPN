// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { intervalForIntensity, useTrafficStream } from "@/lib/traffic";

describe("intervalForIntensity", () => {
  it("maps intensity to a pull interval (ms), heavier = shorter", () => {
    expect(intervalForIntensity("light")).toBe(3000);
    expect(intervalForIntensity("medium")).toBe(1200);
    expect(intervalForIntensity("heavy")).toBe(400);
  });
  it("is monotonic: light > medium > heavy", () => {
    expect(intervalForIntensity("light")).toBeGreaterThan(intervalForIntensity("medium"));
    expect(intervalForIntensity("medium")).toBeGreaterThan(intervalForIntensity("heavy"));
  });
});

describe("useTrafficStream", () => {
  it("does not overlap pulls: no second fetch while the first is in flight", () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const fetchMock = vi.fn(() => new Promise((r) => { resolve = () => r(new Response("")); }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useTrafficStream("s1", "heavy", true)); // 400ms interval
    expect(fetchMock).toHaveBeenCalledTimes(1);   // immediate fire
    vi.advanceTimersByTime(1600);                 // 4 intervals elapse, first still pending
    expect(fetchMock).toHaveBeenCalledTimes(1);   // no overlap
    resolve();
    vi.useRealTimers();
  });
});
