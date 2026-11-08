/* Parameters for Luminescent Dreams listen events.
   The Meta pixel puts the address bar in dl, but the request Referer is only
   the site origin, and Events Manager can show that origin alone. Custom
   parameters are what a song-specific conversion can filter on.
   Only the canonical ids and an allowlist of campaign labels are copied.
   fbclid, emails, names, and every other query key stay out. Store hrefs
   are never rewritten. Other songs return null so their events stay as they are. */
(function (factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.lpListenParams = api.listenParams;
    window.lpPageViewParams = api.pageViewParams;
    window.lpLeadParams = api.leadParams;
  }
})(function () {
  "use strict";

  var SONG = "luminescent-dreams";
  var SONG_NAME = "Luminescent Dreams";
  var SPOTIFY_TRACK = "6Ye477sEzcJg1T6HR0LpRO";
  var APPLE_ALBUM = "6818323895";
  var APPLE_TRACK = "6818323896";
  var AMAZON_ALBUM = "B0HLRPB1WJ";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_id"];
  /* Campaign labels only: no @, spaces, slashes, or encoded leftovers. */
  var SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  var SAFE_PATH = /^\/[A-Za-z0-9/_-]{0,80}$/;
  var LANDINGS = { "/spotify/": true, "/apple/": true, "/amazon/": true };

  function hostOf(url) {
    return String(url.hostname || "").toLowerCase().replace(/^(www|m)\./, "");
  }

  function stripTrailingSlash(pathname) {
    var path = pathname || "/";
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    return path;
  }

  function pagePath(pageUrl) {
    var url;
    try { url = new URL(pageUrl); } catch (err) { return ""; }
    var path = url.pathname || "/";
    path = path.replace(/\/index\.html$/, "/");
    if (path.charAt(0) !== "/") path = "/" + path;
    if (path.charAt(path.length - 1) !== "/") path += "/";
    path = path.replace(/\/{2,}/g, "/");
    if (!SAFE_PATH.test(path)) return "";
    return path;
  }

  function attribution(pageUrl) {
    var out = {};
    var url;
    try { url = new URL(pageUrl); } catch (err) { return out; }
    var path = pagePath(pageUrl);
    if (path) out.page_path = path;
    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      if (!url.searchParams.has(key)) continue;
      var value = url.searchParams.get(key);
      if (value == null) continue;
      value = String(value);
      if (!SAFE_VALUE.test(value)) continue;
      out[key] = value;
    }
    return out;
  }

  function copyAttribution(params, pageUrl) {
    var extra = attribution(pageUrl || "");
    Object.keys(extra).forEach(function (key) { params[key] = extra[key]; });
    return params;
  }

  function matchStore(url) {
    var host = hostOf(url);
    var path = stripTrailingSlash(url.pathname || "");
    if (host === "open.spotify.com" && path === "/track/" + SPOTIFY_TRACK) {
      return { category: "spotify", id: "spotify:" + SPOTIFY_TRACK };
    }
    if (host === "music.apple.com") {
      var parts = path.split("/");
      if (parts.indexOf(APPLE_ALBUM) === -1) return null;
      var track = url.searchParams.get("i");
      if (track && track !== APPLE_TRACK) return null;
      return { category: "apple", id: "apple:" + APPLE_TRACK };
    }
    if (host === "music.amazon.com") {
      var albums = path.split("/");
      if (albums.indexOf(AMAZON_ALBUM) === -1) return null;
      return { category: "amazon", id: "amazon:" + AMAZON_ALBUM };
    }
    return null;
  }

  function listenParams(input) {
    if (!input || !input.href) return null;
    var dest;
    try {
      dest = new URL(input.href, input.pageUrl || "https://lackadaisicalperfection.com/");
    } catch (err) {
      return null;
    }
    var store = matchStore(dest);
    if (!store) return null;
    return copyAttribution({
      content_name: SONG_NAME,
      content_type: "product",
      content_category: store.category,
      content_ids: [SONG, store.id]
    }, input.pageUrl || "");
  }

  function pageViewParams(pageUrl) {
    var extra = attribution(pageUrl || "");
    if (!LANDINGS[extra.page_path]) return null;
    var params = {
      content_name: SONG_NAME,
      content_type: "product",
      content_ids: [SONG],
      page_path: extra.page_path
    };
    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      if (extra[key]) params[key] = extra[key];
    }
    return params;
  }

  /* Lead already uses content_name "Spotify tap" for every song. Keep that
     and add the song fields beside it. */
  function leadParams(songParams) {
    var lead = { content_name: "Spotify tap" };
    if (!songParams) return lead;
    Object.keys(songParams).forEach(function (key) {
      if (key !== "content_name") lead[key] = songParams[key];
    });
    return lead;
  }

  return {
    listenParams: listenParams,
    pageViewParams: pageViewParams,
    leadParams: leadParams
  };
});
