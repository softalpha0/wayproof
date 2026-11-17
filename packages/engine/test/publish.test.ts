// Publishing (F-7, BR-7): personal details are cleaned or found before anything goes public.
import { describe, expect, it } from "vitest";
import { cleanText, findPersonal } from "../src/site/publish.ts";

describe("cleaning files for the public website", () => {
  it("replaces Windows and Unix home folders with ~ (they reveal the computer's user name)", () => {
    expect(cleanText('"session_dir":"C:\\\\Users\\\\someone/.testmuai/kaneai/sessions\\\\abc"')).toBe('"session_dir":"~/.testmuai/kaneai/sessions\\\\abc"');
    expect(cleanText("path C:\\Users\\someone\\x and /Users/someone/y and /home/someone/z")).toBe("path ~\\x and ~/y and ~/z");
  });
});

describe("the privacy scan", () => {
  it("finds home paths, real email addresses and the publisher's private words", () => {
    const hits = findPersonal('user_email: someone@mailprovider.net path C:\\Users\\someone\\x tms_user":"secretname', ["secretname"]);
    expect(hits).toContain("someone@mailprovider.net");
    expect(hits).toContain("secretname");
    expect(hits.some((h) => h.startsWith("C:\\Users"))).toBe(true);
  });

  it("is case-insensitive for private words", () => {
    expect(findPersonal("Hello SecretName", ["secretname"])).toEqual(["secretname"]);
  });

  it("passes clean text, including example.com and GitHub no-reply addresses", () => {
    expect(findPersonal("Kane opened https://revoke.cash and saw 2,193 approvals. Contact: test@example.com, 1+x@users.noreply.github.com", ["secretname"])).toEqual([]);
  });
});
