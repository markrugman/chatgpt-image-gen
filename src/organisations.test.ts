import { describe, expect, it } from "vitest";
import { activeOrganisations, emptyWorkspace } from "./types";

describe("organisation ordering", () => {
  const organisations = ["A", "B", "C"].map(id => ({ id, name: id, color: "#7654cf" }));
  it("keeps legacy order and hides trashed organisations", () => {
    expect(activeOrganisations({ ...emptyWorkspace, organisations: organisations.map(o => ({ ...o, deletedAt: o.id === "B" ? 1 : null })) }).map(o => o.id)).toEqual(["A", "C"]);
  });
  it("uses saved positions without mutating storage order", () => {
    const w = { ...emptyWorkspace, organisations: organisations.map((o, index) => ({ ...o, position: 2 - index })) };
    expect(activeOrganisations(w).map(o => o.id)).toEqual(["C", "B", "A"]);
    expect(w.organisations.map(o => o.id)).toEqual(["A", "B", "C"]);
  });
});
