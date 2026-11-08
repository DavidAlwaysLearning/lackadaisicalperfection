const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const api = require(path.join(root, "assets/listen-params.js"));

const PAGE = "https://lackadaisicalperfection.com/spotify/?utm_source=meta&utm_medium=paid&utm_campaign=luminescent-dreams&utm_content=audience-test&utm_term=freeform+query&utm_id=adset-1&fbclid=IwAR_FAKE_NOT_A_USER&email=pii-token-email&name=David";
const SPOTIFY = "https://open.spotify.com/track/6Ye477sEzcJg1T6HR0LpRO";
const APPLE = "https://music.apple.com/us/album/luminescent-dreams/6818323895?i=6818323896&ls=1";
const AMAZON = "https://music.amazon.com/albums/B0HLRPB1WJ";

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function anchors(html) {
  const out = [];
  const re = /<a\b[^>]*>/g;
  let match;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const href = /href="([^"]*)"/.exec(tag);
    const tap = /data-tap="([^"]*)"/.exec(tag);
    if (!href) continue;
    out.push({
      href: href[1].replace(/&amp;/g, "&"),
      tap: tap ? tap[1] : ""
    });
  }
  return out;
}

test("Spotify tap carries the track id, path, and allowlisted source", () => {
  const params = api.listenParams({ href: SPOTIFY, pageUrl: PAGE });
  assert.deepEqual(params.content_ids, ["luminescent-dreams", "spotify:6Ye477sEzcJg1T6HR0LpRO"]);
  assert.equal(params.content_name, "Luminescent Dreams");
  assert.equal(params.content_type, "product");
  assert.equal(params.content_category, "spotify");
  assert.equal(params.page_path, "/spotify/");
  assert.equal(params.utm_source, "meta");
  assert.equal(params.utm_medium, "paid");
  assert.equal(params.utm_campaign, "luminescent-dreams");
  assert.equal(params.utm_content, "audience-test");
  assert.equal(params.utm_id, "adset-1");
  assert.equal(params.utm_term, undefined);
  const blob = JSON.stringify(params);
  assert.equal(blob.includes("pii-token-email"), false);
  assert.equal(blob.includes("fbclid"), false);
  assert.equal(blob.includes("IwAR_FAKE"), false);
  assert.equal(blob.includes("David"), false);
  assert.equal(blob.includes("freeform"), false);
});

test("Apple and Amazon taps use their own canonical ids and ignore store query", () => {
  const apple = api.listenParams({
    href: APPLE + "&utm_source=should-not-come-from-the-store",
    pageUrl: "https://lackadaisicalperfection.com/apple/index.html?utm_content=audience-b"
  });
  assert.equal(apple.content_category, "apple");
  assert.deepEqual(apple.content_ids, ["luminescent-dreams", "apple:6818323896"]);
  assert.equal(apple.page_path, "/apple/");
  assert.equal(apple.utm_content, "audience-b");
  assert.equal(apple.utm_source, undefined);

  const amazon = api.listenParams({
    href: AMAZON + "?ref=dm_sh_something",
    pageUrl: "https://lackadaisicalperfection.com/amazon/?utm_source=meta"
  });
  assert.equal(amazon.content_category, "amazon");
  assert.deepEqual(amazon.content_ids, ["luminescent-dreams", "amazon:B0HLRPB1WJ"]);
  assert.equal(amazon.page_path, "/amazon/");
  assert.equal(amazon.utm_source, "meta");
});

test("other songs and non-store links are not labeled as Luminescent Dreams", () => {
  const samples = [
    "https://open.spotify.com/track/5EEBYde0Cn459esR9Kohjn",
    "https://open.spotify.com/track/63f3kwienzLlNG3Qzx2TIz",
    "https://open.spotify.com/track/1lBCRmvVNIjltDzYi80JSI",
    "https://open.spotify.com/album/3Yo4sk9QOR7ToSO01Wn72U",
    "https://open.spotify.com/embed/track/6Ye477sEzcJg1T6HR0LpRO",
    "https://open.spotify.com/artist/5qoC4NXvjfV3cylbXALzV3",
    "https://music.apple.com/us/album/tapestry-of-whispers/6820663406?i=6820663407&ls=1",
    "https://music.amazon.com/albums/B0HMFN2M3T",
    "https://music.apple.com/us/album/luminescent-dreams/6818323895?i=999",
    "https://lackadaisicalperfection.com/spotify/",
    "javascript:alert(1)"
  ];
  for (const href of samples) {
    assert.equal(api.listenParams({ href: href, pageUrl: PAGE }), null, href);
  }
});

test("unsafe campaign values are dropped and safe ones are bounded at 64 characters", () => {
  const ok = "a" + "b".repeat(63);
  const tooLong = "a" + "b".repeat(64);
  const params = api.listenParams({
    href: SPOTIFY + "?si=share-token",
    pageUrl: "https://lackadaisicalperfection.com/spotify/?utm_source=" + ok + "&utm_medium=" + tooLong + "&utm_campaign=person@example.com&utm_content=-leading-hyphen&utm_id="
  });
  assert.equal(params.utm_source, ok);
  assert.equal(params.utm_medium, undefined);
  assert.equal(params.utm_campaign, undefined);
  assert.equal(params.utm_content, undefined);
  assert.equal(params.utm_id, undefined);
  assert.equal(JSON.stringify(params).includes("person@"), false);
  assert.equal(JSON.stringify(params).includes("share-token"), false);
});

test("landing page views are song-specific and are not store taps", () => {
  const view = api.pageViewParams(PAGE);
  assert.deepEqual(view.content_ids, ["luminescent-dreams"]);
  assert.equal(view.content_name, "Luminescent Dreams");
  assert.equal(view.content_category, undefined);
  assert.equal(view.page_path, "/spotify/");
  assert.equal(view.utm_content, "audience-test");
  assert.equal(JSON.stringify(view).includes("6Ye477sEzcJg1T6HR0LpRO"), false);
  assert.equal(api.pageViewParams("https://lackadaisicalperfection.com/apple/").page_path, "/apple/");
  assert.equal(api.pageViewParams("https://lackadaisicalperfection.com/amazon/index.html").page_path, "/amazon/");
  assert.equal(api.pageViewParams("https://lackadaisicalperfection.com/tapestry-of-whispers/?utm_content=audience-test"), null);
  assert.equal(api.pageViewParams("https://lackadaisicalperfection.com/"), null);
  const dirty = api.pageViewParams("https://lackadaisicalperfection.com/spotify/?utm_content=" + encodeURIComponent("<script>"));
  assert.equal(dirty.page_path, "/spotify/");
  assert.equal(dirty.utm_content, undefined);
});

test("Lead keeps the existing content_name and adds the song ids beside it", () => {
  const song = api.listenParams({ href: SPOTIFY, pageUrl: PAGE });
  const lead = api.leadParams(song);
  assert.equal(lead.content_name, "Spotify tap");
  assert.deepEqual(lead.content_ids, ["luminescent-dreams", "spotify:6Ye477sEzcJg1T6HR0LpRO"]);
  assert.equal(lead.page_path, "/spotify/");
  assert.notEqual(lead, song);
  assert.deepEqual(api.leadParams(null), { content_name: "Spotify tap" });
});

test("the three landing pages keep their store URLs and send parameters", () => {
  const pages = [
    ["spotify/index.html", "/spotify/", "SpotifyTap", SPOTIFY],
    ["apple/index.html", "/apple/", "AppleTap", APPLE],
    ["amazon/index.html", "/amazon/", "AmazonTap", AMAZON]
  ];
  for (const [rel, pagePath, primary, primaryHref] of pages) {
    const html = read(rel);
    assert.equal(html.includes('src="/assets/listen-params.js"'), true, rel);
    assert.equal(html.includes("lpPageViewParams(location.href)"), true, rel);
    assert.equal(html.includes('fbq("trackCustom", name, tapParams(a))'), true, rel);
    assert.equal(html.includes('fbq("trackCustom", name, tapParams(a), { eventCallback: leave })'), true, rel);
    assert.equal(html.includes('fbq("trackCustom", name);'), false, rel);
    assert.equal(html.includes('fbq("trackCustom", name, {},'), false, rel);
    const links = anchors(html).filter((link) => link.tap);
    assert.equal(links.length, 3, rel);
    const first = links[0];
    assert.equal(first.tap, primary, rel);
    assert.equal(first.href, primaryHref, rel);
    for (const link of links) {
      const params = api.listenParams({
        href: link.href,
        pageUrl: "https://lackadaisicalperfection.com" + pagePath + "?utm_content=audience-test"
      });
      assert.equal(params.content_ids[0], "luminescent-dreams", link.href);
      assert.equal(params.page_path, pagePath);
      const store = { SpotifyTap: "spotify", AppleTap: "apple", AmazonTap: "amazon" }[link.tap];
      assert.equal(params.content_category, store, link.href);
    }
  }
});

test("Tapestry links and events stay free of Luminescent ids", () => {
  const html = read("tapestry-of-whispers/index.html");
  assert.equal(html.includes("listen-params.js"), false);
  assert.equal(html.includes("6Ye477sEzcJg1T6HR0LpRO"), false);
  assert.equal(html.includes("6818323896"), false);
  assert.equal(html.includes("B0HLRPB1WJ"), false);
  const listen = anchors(html).find((link) => link.href.includes("open.spotify.com/track/"));
  assert.equal(listen.href, "https://open.spotify.com/track/5EEBYde0Cn459esR9Kohjn");
  assert.equal(api.listenParams({ href: listen.href, pageUrl: "https://lackadaisicalperfection.com/tapestry-of-whispers/?utm_content=audience-test" }), null);

  const nav = read("assets/site-nav.js");
  assert.equal(nav.includes('content_name: "Spotify tap"'), true);
  assert.equal(nav.includes('else window.fbq("trackCustom", "SpotifyTap")'), true);
  assert.equal(nav.includes("pageAlreadySendsSpotifyTap"), true);
  assert.equal(nav.includes("6Ye477sEzcJg1T6HR0LpRO"), false);

  for (const rel of ["index.html", "scores/luminescent-dreams/index.html", "scores/tapestry-of-whispers/index.html"]) {
    assert.equal(read(rel).includes("listen-params.js"), false, rel);
  }
});
