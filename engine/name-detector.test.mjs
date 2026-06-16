import test from "node:test";
import assert from "node:assert/strict";
import { detectNames } from "./name-detector.js";
import { detectPii } from "./pii-detector.js";
import { detectSuggestions } from "./suggestion-utils.js";
import { applyConfigToString } from "./redact-rules.js";

test("detectNames hides common deck vocabulary", () => {
  const snippets = [
    "Press Shift to copy",
    "Use the Option key",
    "SOCIAL MEDIA PLAYBOOK",
    "Content strategy overview",
    "Strong growth in PROPERTY segment"
  ];
  const tokens = detectNames(snippets).map((entry) => entry.token.toLowerCase());
  assert.equal(tokens.includes("shift"), false);
  assert.equal(tokens.includes("option"), false);
  assert.equal(tokens.includes("social"), false);
  assert.equal(tokens.includes("playbook"), false);
  assert.equal(tokens.includes("content"), false);
  assert.equal(tokens.includes("strong"), false);
  assert.equal(tokens.includes("property"), false);
});

test("detectNames keeps mid-sentence names and line-start brands", () => {
  const snippets = [
    "We met Elena at the summit",
    "Nokia is primarily a network vendor",
    "ORION launched a new campaign"
  ];
  const byToken = new Map(detectNames(snippets).map((entry) => [entry.token.toLowerCase(), entry]));
  assert.equal(byToken.get("elena")?.confidence, "high");
  assert.equal(byToken.get("nokia")?.confidence, "high");
  assert.equal(byToken.get("orion")?.confidence, "high");
});

test("detectNames includes context snippets", () => {
  const [entry] = detectNames(["We met Elena at the summit"]);
  assert.ok(entry.contexts.length > 0);
  assert.match(entry.contexts[0], /Elena/i);
});

test("detectPii finds contact details", () => {
  const snippets = ["Contact jane.doe@acme.com or visit https://client.example.com/path"];
  const results = detectPii(snippets);
  const kinds = new Set(results.map((entry) => entry.kind));
  assert.equal(kinds.has("email"), true);
  assert.equal(kinds.has("url"), true);
});

test("applyConfigToString redacts PII before explicit terms", () => {
  const result = applyConfigToString("Email jane@acme.com about Acme", {
    text: {
      terms: ["Acme"],
      replacement: "[REDACTED]",
      redactPii: true
    },
    numberGroups: []
  });
  assert.equal(result.text, "Email [REDACTED] about [REDACTED]");
  assert.equal(result.textStats.count, 2);
});

test("detectSuggestions merges names and PII", () => {
  const results = detectSuggestions(["Reach Elena at elena@client.com"]);
  const tokens = results.map((entry) => entry.token.toLowerCase());
  assert.equal(tokens.includes("elena"), true);
  assert.equal(tokens.some((token) => token.includes("@")), true);
});
