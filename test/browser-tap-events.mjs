/**
 * Click the real landing pages in Chrome and read the Meta pixel request.
 * facebook.com/tr is aborted before it is sent, so this does not record a hit
 * on dataset 257777058255900. Requires Google Chrome.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const chrome = process.env.CHROME || "/opt/google/chrome/chrome";
const port = 8765;
const debugPort = 9241;
const query = "utm_source=meta&utm_medium=paid&utm_campaign=luminescent-dreams&utm_content=audience-test&utm_term=freeform+query&email=pii-token-email&fbclid=IwAR_FAKE_NOT_A_USER&name=David";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  let rel = normalize(decoded).replace(/^([/\\])+/, "");
  if (rel.endsWith("/")) rel += "index.html";
  if (rel === "") rel = "index.html";
  const full = join(root, rel);
  if (full !== root && !full.startsWith(root)) return null;
  return full;
}

const server = createServer(async (req, res) => {
  try {
    const full = fileFor(req.url || "/");
    const body = await readFile(full);
    res.writeHead(200, { "content-type": types[extname(full)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

function cdOf(raw) {
  const url = new URL(raw);
  const cd = {};
  for (const [key, value] of url.searchParams) {
    if (key.startsWith("cd[")) cd[key] = value;
  }
  return {
    ev: url.searchParams.get("ev"),
    dl: url.searchParams.get("dl"),
    cd,
    blob: JSON.stringify(cd)
  };
}

function assertIncludes(label, blob, text) {
  if (!blob.includes(text)) throw new Error(label + " missing " + text + " in " + blob);
}

function assertOmits(label, blob, text) {
  if (blob.includes(text)) throw new Error(label + " leaked " + text + " in " + blob);
}

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const child = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  `--remote-debugging-port=${debugPort}`,
  "--user-data-dir=/tmp/chrome-lp-tap-test",
  "about:blank"
], { stdio: "ignore" });

let ws;
const summary = [];
try {
  for (let i = 0; i < 50; i++) {
    try {
      const ready = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (ready.ok) break;
    } catch { /* chrome still starting */ }
    await delay(150);
  }
  const tab = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  function send(method, params = {}) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("timeout " + method));
        }
      }, 15000);
    });
  }
  const hits = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
      return;
    }
    if (msg.method === "Fetch.requestPaused") {
      const req = msg.params.request;
      const headers = req.headers || {};
      hits.push({
        url: req.url,
        referer: headers.Referer || headers.referer || "",
        parsed: cdOf(req.url)
      });
      ws.send(JSON.stringify({
        id: ++seq,
        method: "Fetch.failRequest",
        params: { requestId: msg.params.requestId, errorReason: "Aborted" }
      }));
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error("websocket failed")));
  });
  await send("Fetch.enable", {
    patterns: [
      { urlPattern: "*facebook.com/tr*", requestStage: "Request" },
      { urlPattern: "*open.spotify.com/*", requestStage: "Request" },
      { urlPattern: "*music.apple.com/*", requestStage: "Request" },
      { urlPattern: "*music.amazon.com/*", requestStage: "Request" }
    ]
  });
  await send("Page.enable");

  async function openPage(path) {
    const before = hits.length;
    await send("Page.navigate", { url: `http://127.0.0.1:${port}${path}?${query}` });
    for (let i = 0; i < 40 && hits.length === before; i++) await delay(200);
    if (hits.length === before) throw new Error("no pixel request for " + path);
    return hits[hits.length - 1];
  }

  async function click(selector) {
    const before = hits.length;
    const clicked = await send("Runtime.evaluate", {
      expression: `(() => {
        window.__opened = [];
        window.__assigned = [];
        window.open = function (href) { window.__opened.push(String(href)); return { closed: false }; };
        try { location.assign = function (href) { window.__assigned.push(String(href)); }; } catch (err) {}
        const a = document.querySelector(${JSON.stringify(selector)});
        if (!a) return JSON.stringify({ error: "missing" });
        const href = a.href;
        a.click();
        return JSON.stringify({ href: href, opened: window.__opened, assigned: window.__assigned });
      })()`,
      returnByValue: true
    });
    for (let i = 0; i < 20 && hits.length === before; i++) await delay(150);
    await delay(500);
    return { click: JSON.parse(clicked.result.value), events: hits.slice(before) };
  }

  const spotifyView = await openPage("/spotify/");
  assertIncludes("PageView", spotifyView.parsed.blob, "luminescent-dreams");
  assertIncludes("PageView", spotifyView.parsed.blob, '"/spotify/"');
  assertIncludes("PageView path", spotifyView.parsed.dl, "/spotify/");
  assertIncludes("PageView source", spotifyView.parsed.dl, "utm_content=audience-test");
  assertOmits("PageView params", spotifyView.parsed.blob, "pii-token-email");
  assertOmits("PageView params", spotifyView.parsed.blob, "fbclid");
  assertOmits("PageView params", spotifyView.parsed.blob, "David");
  if (spotifyView.referer.includes("/spotify/")) throw new Error("Referer unexpectedly kept the path: " + spotifyView.referer);
  summary.push({ event: "PageView", referer: spotifyView.referer, dl: spotifyView.parsed.dl, cd: spotifyView.parsed.cd });

  const spotifyTap = await click('a[data-tap="SpotifyTap"]');
  if (spotifyTap.click.href !== "https://open.spotify.com/track/6Ye477sEzcJg1T6HR0LpRO") {
    throw new Error("Spotify href changed: " + spotifyTap.click.href);
  }
  if (!spotifyTap.click.opened.includes("https://open.spotify.com/track/6Ye477sEzcJg1T6HR0LpRO")) {
    throw new Error("Spotify tap did not open the track: " + JSON.stringify(spotifyTap.click));
  }
  const lead = spotifyTap.events.find((hit) => hit.parsed.ev === "Lead");
  const tap = spotifyTap.events.find((hit) => hit.parsed.ev === "SpotifyTap");
  if (!lead || !tap) throw new Error("missing Lead or SpotifyTap: " + JSON.stringify(spotifyTap.events.map((hit) => hit.parsed.ev)));
  assertIncludes("Lead", lead.parsed.blob, "Spotify tap");
  assertIncludes("Lead song", lead.parsed.blob, "luminescent-dreams");
  assertIncludes("Lead track", lead.parsed.blob, "spotify:6Ye477sEzcJg1T6HR0LpRO");
  assertIncludes("Lead source", lead.parsed.blob, "audience-test");
  assertOmits("Lead params", lead.parsed.blob, "pii-token-email");
  assertIncludes("SpotifyTap", tap.parsed.blob, "Luminescent Dreams");
  assertIncludes("SpotifyTap track", tap.parsed.blob, "spotify:6Ye477sEzcJg1T6HR0LpRO");
  assertIncludes("SpotifyTap path", tap.parsed.blob, "/spotify/");
  assertIncludes("SpotifyTap source", tap.parsed.blob, "audience-test");
  assertOmits("SpotifyTap params", tap.parsed.blob, "pii-token-email");
  assertOmits("SpotifyTap params", tap.parsed.blob, "fbclid");
  summary.push({ event: "Lead", cd: lead.parsed.cd }, { event: "SpotifyTap", cd: tap.parsed.cd, opened: spotifyTap.click.opened });

  const appleTap = await click('a[data-tap="AppleTap"]');
  if (!appleTap.click.href.includes("i=6818323896") || !appleTap.click.opened.some((href) => href.includes("i=6818323896") && href.includes("/6818323895"))) {
    throw new Error("Apple href changed: " + JSON.stringify(appleTap.click));
  }
  const apple = appleTap.events.find((hit) => hit.parsed.ev === "AppleTap");
  if (!apple) throw new Error("missing AppleTap");
  if (appleTap.events.some((hit) => hit.parsed.ev === "Lead")) throw new Error("Apple tap also fired Lead");
  assertIncludes("AppleTap", apple.parsed.blob, "apple:6818323896");
  assertIncludes("AppleTap", apple.parsed.blob, "luminescent-dreams");
  assertOmits("AppleTap", apple.parsed.blob, "ls=1");
  summary.push({ event: "AppleTap", cd: apple.parsed.cd, href: appleTap.click.href });

  await send("Runtime.evaluate", {
    expression: `document.querySelector('a[data-tap="AmazonTap"]').removeAttribute("target")`,
    returnByValue: true
  });
  const amazonTap = await click('a[data-tap="AmazonTap"]');
  const amazon = amazonTap.events.find((hit) => hit.parsed.ev === "AmazonTap");
  if (!amazon) throw new Error("missing AmazonTap: " + JSON.stringify(amazonTap.events.map((hit) => hit.parsed.ev)));
  assertIncludes("AmazonTap", amazon.parsed.blob, "amazon:B0HLRPB1WJ");
  assertIncludes("AmazonTap path", amazon.parsed.blob, "/spotify/");
  const amazonUrl = "https://music.amazon.com/albums/B0HLRPB1WJ";
  const amazonNavigation = amazonTap.events.map((hit) => hit.url).find((url) => {
    try { return new URL(url).hostname === "music.amazon.com"; } catch (err) { return false; }
  });
  const keptHref = amazonTap.click.assigned.includes(amazonUrl) || amazonTap.click.opened.includes(amazonUrl);
  let navigationClean = false;
  if (amazonNavigation) {
    const destination = new URL(amazonNavigation);
    navigationClean = destination.pathname.replace(/\/$/, "") === "/albums/B0HLRPB1WJ" &&
      !destination.search.includes("utm_") &&
      !destination.search.includes("email") &&
      !destination.search.includes("fbclid");
  }
  if (!keptHref && !navigationClean) {
    throw new Error("same-tab Amazon tap did not keep the album URL: " + JSON.stringify({
      click: amazonTap.click,
      amazonNavigation
    }));
  }
  summary.push({
    event: "AmazonTap",
    cd: amazon.parsed.cd,
    assigned: amazonTap.click.assigned,
    opened: amazonTap.click.opened,
    amazonNavigation: amazonNavigation || null
  });

  const appleView = await openPage("/apple/");
  assertIncludes("Apple page", appleView.parsed.blob, "/apple/");
  const amazonView = await openPage("/amazon/");
  assertIncludes("Amazon page", amazonView.parsed.blob, "/amazon/");
  summary.push({ event: "PageView /apple/", cd: appleView.parsed.cd }, { event: "PageView /amazon/", cd: amazonView.parsed.cd });

  const tapestryView = await openPage("/tapestry-of-whispers/");
  assertOmits("Tapestry PageView", tapestryView.parsed.blob, "luminescent-dreams");
  await send("Runtime.evaluate", {
    expression: `document.addEventListener("click", function (event) {
      var a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (a && /open\\.spotify\\.com|music\\.apple\\.com|music\\.amazon\\.com/.test(a.href)) event.preventDefault();
    }, true); "guard";`,
    returnByValue: true
  });
  const tapestryTap = await click('a[data-lp-event="spotify"]');
  if (tapestryTap.click.href !== "https://open.spotify.com/track/5EEBYde0Cn459esR9Kohjn") {
    throw new Error("Tapestry href changed: " + tapestryTap.click.href);
  }
  const tapestryLead = tapestryTap.events.find((hit) => hit.parsed.ev === "Lead");
  const tapestrySpotify = tapestryTap.events.find((hit) => hit.parsed.ev === "SpotifyTap");
  if (!tapestryLead || !tapestrySpotify) throw new Error("Tapestry click missing events");
  assertIncludes("Tapestry Lead", tapestryLead.parsed.blob, "Spotify tap");
  assertOmits("Tapestry Lead", tapestryLead.parsed.blob, "luminescent-dreams");
  assertOmits("Tapestry SpotifyTap", tapestrySpotify.parsed.blob, "luminescent-dreams");
  assertOmits("Tapestry SpotifyTap", tapestrySpotify.parsed.blob, "6Ye477sEzcJg1T6HR0LpRO");
  summary.push({
    event: "Tapestry Lead",
    cd: tapestryLead.parsed.cd,
    spotifyTapCd: tapestrySpotify.parsed.cd,
    href: tapestryTap.click.href
  });

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err && err.stack || err), summary }, null, 2));
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch { /* already closed */ }
  child.kill("SIGKILL");
  server.close();
}
