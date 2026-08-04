import { describe, expect, it } from "vitest";
import { parseMemberImport } from "./migration";

const ctx = { planCodes: ["SL-AD-BASIC", "SL-KD-BASIC"], salonKeys: ["ilorin", "abuja"] };

describe("parseMemberImport (v3 §9)", () => {
  it("parses a valid file", () => {
    const { headerError, rows } = parseMemberImport(
      [
        "full_name,email,phone,whatsapp,plan_code,start_date,home_salon",
        'Amina Yusuf,amina@x.com,+2348011112222,,sl-ad-basic,2026-08-01,Ilorin',
        '"Bello, Hauwa",hauwa@x.com,+2348033334444,+2348033334444,SL-KD-BASIC,,',
      ].join("\n"),
      ctx,
    );
    expect(headerError).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[0].whatsapp).toBe("+2348011112222"); // falls back to phone
    expect(rows[1].full_name).toBe("Bello, Hauwa");  // quoted comma
    expect(rows[1].errors).toHaveLength(0);
  });

  it("flags bad rows without dropping them (dry-run visibility)", () => {
    const { rows } = parseMemberImport(
      [
        "full_name,email,phone,plan_code",
        "X,notanemail,08012345678,SL-AD-BASIC",
        "Amina,ok@x.com,123,NOPE",
        "Amina,ok@x.com,+2348011112222,SL-AD-BASIC",
      ].join("\n"),
      ctx,
    );
    expect(rows[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining("full_name"), expect.stringContaining("email")]),
    );
    expect(rows[1].errors).toEqual(
      expect.arrayContaining([expect.stringContaining("phone"), expect.stringContaining("plan_code")]),
    );
    expect(rows[2].errors).toEqual(
      expect.arrayContaining([expect.stringContaining("duplicate email")]),
    );
  });

  it("rejects a missing required column", () => {
    const { headerError } = parseMemberImport(
      "full_name,email,phone\nA,a@b.c,08000000000", ctx);
    expect(headerError).toMatch(/plan_code/);
  });
});
