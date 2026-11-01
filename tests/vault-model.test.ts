import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoData, defaultGeneratorOptions, generatePassword, healthOf, removeFolder, safeWebsite } from "../src/features/vault/model.ts";

test("generator respects required character classes, length and ambiguity exclusions", () => {
  for (const length of [8, 16, 64]) {
    for (let i = 0; i < 50; i++) {
      const value = generatePassword({ ...defaultGeneratorOptions, length });
      assert.equal(value.length, length);
      assert.match(value, /[A-Z]/); assert.match(value, /[a-z]/); assert.match(value, /[0-9]/); assert.match(value, /[!@#$%&*+\-=?]/);
      assert.doesNotMatch(value, /[O0Il1]/);
    }
  }
});
test("generator enforces selected types and rejects invalid option combinations", () => {
  const options = { ...defaultGeneratorOptions, uppercase:false, lowercase:false, symbols:false };
  assert.match(generatePassword(options), /^[2-9]{16}$/);
  assert.throws(() => generatePassword({ ...options, numbers:false }), /at least one/);
  assert.throws(() => generatePassword({ ...options, length:7 }), /between 8 and 64/);
  assert.throws(() => generatePassword({ ...options, length:65 }), /between 8 and 64/);
  assert.throws(() => generatePassword({ ...options, length:12.5 }), /between 8 and 64/);
});
test("reuse is exact and marks both participating entries", () => {
  const items = createDemoData().logins;
  const a = { ...items[0], password:"Unique-Example!22" };
  const b = { ...items[1], password:"Unique-Example!22" };
  assert.equal(healthOf(a,[a,b]),"reused"); assert.equal(healthOf(b,[a,b]),"reused");
  assert.equal(healthOf(a,[a,{...b,password:"unique-example!22"}]),"strong");
  assert.equal(healthOf(a,[a,{...b,password:"Unique-Example!22 "}]),"strong");
});
test("deleting a folder preserves all items and moves only its contents to Unfiled", () => {
  const data = createDemoData();
  const entries = removeFolder(data.logins,"personal");
  assert.equal(entries.length,24);
  assert.equal(entries.filter(item => item.folderId === "personal").length,0);
  assert.equal(entries.filter(item => item.folderId === "work").length,data.logins.filter(item => item.folderId === "work").length);
  assert.ok(data.logins.some(item => item.folderId === "personal"));
  assert.equal(removeFolder(data.notes,"personal").length,6);
});
test("website fields reject executable or malformed addresses", () => {
  assert.equal(safeWebsite("javascript:alert(1)"),null);
  assert.equal(safeWebsite("data:text/html,test"),null);
  assert.equal(safeWebsite("not a URL"),null);
  assert.equal(safeWebsite("https://example.com"),"https://example.com/");
});
test("demo counts are consistent and activity is content-free", () => {
  const data = createDemoData();
  assert.equal(data.logins.length,24); assert.equal(data.notes.length,6);
  assert.equal(data.logins.filter(item => healthOf(item,data.logins) !== "strong").length,5);
  const activity = JSON.stringify(data.activity);
  for (const login of data.logins) assert.ok(!activity.includes(login.password));
  for (const note of data.notes) assert.ok(!activity.includes(note.content));
});
