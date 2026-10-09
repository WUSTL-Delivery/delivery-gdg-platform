import { describe, expect, it } from "vitest";
import { isAllowedEmail, normalizeEmail } from "@/lib/email-domain";

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Jane.Doe@WUSTL.edu ")).toBe("jane.doe@wustl.edu");
  });
});

describe("isAllowedEmail", () => {
  it.each([
    "jane@wustl.edu",
    "JANE@WUSTL.EDU",
    " jane.doe+robots@wustl.edu ",
  ])("accepts %j", (email) => {
    expect(isAllowedEmail(email)).toBe(true);
  });

  it.each([
    "jane@gmail.com",
    "jane@wustl.edu.evil.com",
    "jane@notwustl.edu",
    "jane@cse.wustl.edu",
    "jane@wustl.edu@gmail.com",
    "jane@gmail.com@wustl.edu",
    "@wustl.edu",
    "wustl.edu",
    "ja ne@wustl.edu",
    "",
    // Address-list syntax nodemailer would re-parse into a different mailbox
    "victim<attacker@wustl.edu",
    "victim(x)attacker@wustl.edu",
    "jdoe;attacker@wustl.edu",
    "a:b@wustl.edu",
    "attacker,victim@wustl.edu",
    '"quoted"@wustl.edu',
  ])("rejects %j", (email) => {
    expect(isAllowedEmail(email)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isAllowedEmail(undefined)).toBe(false);
    expect(isAllowedEmail(42)).toBe(false);
  });
});
