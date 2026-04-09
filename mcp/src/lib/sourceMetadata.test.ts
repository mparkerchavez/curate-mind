// Regression tests for source metadata parsing and URL normalization.
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSourceUrl,
  parseSourceMetadataHeader,
} from "./sourceMetadata.js";

test("normalizeSourceUrl accepts plain URLs", () => {
  assert.equal(
    normalizeSourceUrl("https://example.com/article"),
    "https://example.com/article"
  );
});

test("normalizeSourceUrl extracts href from markdown links", () => {
  assert.equal(
    normalizeSourceUrl("[watch here](https://youtu.be/demo123)"),
    "https://youtu.be/demo123"
  );
});

test("normalizeSourceUrl unwraps google search redirect links", () => {
  assert.equal(
    normalizeSourceUrl(
      "[https://youtu.be/demo123](https://www.google.com/search?q=https://youtu.be/demo123)"
    ),
    "https://youtu.be/demo123"
  );
});

test("normalizeSourceUrl rejects verify placeholders and malformed values", () => {
  assert.equal(normalizeSourceUrl("[verify]"), undefined);
  assert.equal(normalizeSourceUrl("not-a-url"), undefined);
});

test("parseSourceMetadataHeader normalizes url metadata", () => {
  const parsed = parseSourceMetadataHeader(`# Sample Title

## Metadata
* **Publisher:** Example
* **Published:** 2026-02-01
* **Type:** Blog Post
* **URL:** [https://example.com/post](https://www.google.com/search?q=https://example.com/post)

---

Body`);

  assert.equal(parsed.title, "Sample Title");
  assert.equal(parsed.publisherName, "Example");
  assert.equal(parsed.sourceType, "article");
  assert.equal(parsed.canonicalUrl, "https://example.com/post");
});

test("parseSourceMetadataHeader accepts metadata lines without list bullets", () => {
  const parsed = parseSourceMetadataHeader(`# Source

## Metadata
**Type:** Research Paper
**URL:** https://example.com/research

---
`);

  assert.equal(parsed.sourceType, "report");
  assert.equal(parsed.canonicalUrl, "https://example.com/research");
});
