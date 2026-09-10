import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSiteUrl } from "../src/lib/site";

test("site origin is optional and normalizes a valid deployment URL", () => {
  assert.equal(parseSiteUrl(undefined), undefined);
  assert.equal(parseSiteUrl("  "), undefined);
  assert.equal(
    parseSiteUrl("https://example.com")?.href,
    "https://example.com/",
  );
  assert.equal(
    parseSiteUrl("http://localhost:3000/")?.origin,
    "http://localhost:3000",
  );
});

test("site origin rejects malformed URLs and deployment subpaths", () => {
  for (const value of [
    "example.com",
    "ftp://example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com/?query=1",
    "https://example.com/#fragment",
  ]) {
    assert.throws(() => parseSiteUrl(value));
  }
});
