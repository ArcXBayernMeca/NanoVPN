// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MapBackdrop } from "@/components/MapBackdrop";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
beforeEach(() => { vi.stubGlobal("fetch", () => new Promise(() => {})); });

describe("MapBackdrop", () => {
  it("renders a backdrop wrapper without crashing", () => {
    const { container } = render(<MapBackdrop />);
    expect(container.querySelector(".mbk")).toBeTruthy();
  });
});
