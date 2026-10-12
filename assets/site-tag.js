/*
 * Google tag for lackadaisicalperfection.com, the single place to configure it.
 *
 * PLACEHOLDER: no real Google tag ID exists yet. While GOOGLE_TAG_ID is empty,
 * this file does nothing: no network request, no cookies, no events.
 *
 * To turn it on (David):
 *   1. GOOGLE_TAG_ID: the Google Ads tag ID ("AW-123456789") or GA4 ID ("G-XXXXXXX").
 *   2. FAN_SIGNUP_SEND_TO: from the Google Ads "Fan signup" conversion action,
 *      e.g. "AW-123456789/AbCdEfGhIjk". Leave empty if you only use GA4.
 */
(function () {
  var GOOGLE_TAG_ID = "";        // TODO(David): fill with the real AW-/G- ID
  var FAN_SIGNUP_SEND_TO = "";   // TODO(David): fill with "AW-.../label"

  if (!GOOGLE_TAG_ID) return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GOOGLE_TAG_ID);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GOOGLE_TAG_ID);

  // The 'Fan signup' conversion fires only on /subscribe/thanks/.
  var path = window.location.pathname.replace(/\/?$/, "/");
  if (path === "/subscribe/thanks/") {
    // Fire once per browser session, so reloading the page doesn't count twice.
    try {
      if (sessionStorage.getItem("lpFanSignupFired")) return;
      sessionStorage.setItem("lpFanSignupFired", "1");
    } catch (e) {}
    gtag("event", "sign_up", { method: "mailchimp", event_label: "Fan signup" });
    if (FAN_SIGNUP_SEND_TO) {
      gtag("event", "conversion", { send_to: FAN_SIGNUP_SEND_TO, value: 1.0, currency: "USD" });
    }
  }
})();
