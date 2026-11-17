const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const api = require(path.join(root, "assets/fan-signup.js"));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

test("email is trimmed and lowercased, then checked simply", () => {
  assert.equal(api.normalizeEmail("  Ada@Example.COM "), "ada@example.com");
  assert.equal(api.isValidEmail(api.normalizeEmail("  Ada@Example.COM ")), true);
  assert.equal(api.isValidEmail("not-an-email"), false);
  assert.equal(api.isValidEmail("a@b"), false);
  assert.equal(api.isValidEmail("a b@example.com"), false);
  assert.equal(api.isValidEmail(""), false);
});

test("submits under 3 seconds are too soon", () => {
  assert.equal(api.MIN_MS, 3000);
  assert.equal(api.tooSoon(1000, 3999), true);
  assert.equal(api.tooSoon(1000, 4000), false);
});

test("the endpoint stays a placeholder until a real https URL is pasted", () => {
  const source = read("assets/fan-signup.js");
  assert.match(source, /var FAN_SIGNUP_ENDPOINT = "PASTE_WEB_APP_URL_HERE"/);
  assert.equal(api.endpointReady("PASTE_WEB_APP_URL_HERE"), false);
  assert.equal(api.endpointReady(""), false);
  assert.equal(api.endpointReady("http://example.com/exec"), false);
  assert.equal(api.endpointReady("https://script.google.com/macros/s/abc/exec"), true);
  assert.equal(api.endpointReady("http://127.0.0.1:8765/signup"), true);
  assert.equal(api.endpointReady("http://localhost:8765/signup"), true);
});

test("query-string email prefill still undoes one encoding layer", () => {
  assert.equal(api.decodeEmail("fan%40example.com"), "fan@example.com");
  assert.equal(api.decodeEmail(" fan@example.com "), "fan@example.com");
});

test("the subscribe page no longer mentions Mailchimp", () => {
  const page = read("subscribe/index.html");
  assert.match(page, /data-fan-signup/);
  assert.match(page, /name="company_fax"/);
  assert.match(page, /src="\/assets\/fan-signup\.js"/);
  assert.doesNotMatch(page, /list-manage|mailchimp|mc-embedded|98dfcedfd9|us4\./i);
  assert.equal(api.THANKS.includes("—"), false);
  assert.equal(api.PREVIEW.includes("—"), false);
});

test("the site has no Mailchimp embed left", () => {
  const hits = [];
  for (const file of walk(root, [])) {
    const rel = path.relative(root, file);
    if (rel.startsWith("test" + path.sep) || rel.startsWith("tools" + path.sep)) continue;
    if (!/\.(html|js|css|txt|xml)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (/list-manage|mailchimp|chimpstatic|mc-embedded|98dfcedfd9/i.test(text)) {
      hits.push(rel);
    }
  }
  assert.deepEqual(hits, []);
});
