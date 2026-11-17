/* Fan signup shared by every form with data-fan-signup.
   PASTE THE GOOGLE APPS SCRIPT WEB APP URL HERE.
   Steps: tools/fan-signup/README.md
   While this is still the placeholder, the form does not send an email anywhere. */
var FAN_SIGNUP_ENDPOINT = "PASTE_WEB_APP_URL_HERE";

(function (factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    api.bind(document, window, FAN_SIGNUP_ENDPOINT);
  }
})(function () {
  var MIN_MS = 3000;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var THANKS = "Thank you. You're on the list.";
  var PREVIEW = "Thank you. This preview is not saving emails yet.";
  var WAIT = "Please wait a moment, then try again.";
  var BAD_EMAIL = "Please check that email and try again.";

  function normalizeEmail(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function isValidEmail(email) {
    if (!email || email.length > 254) return false;
    return EMAIL_RE.test(email);
  }

  function tooSoon(loadedAt, now) {
    return (Number(now) - Number(loadedAt)) < MIN_MS;
  }

  function endpointReady(url) {
    if (typeof url !== "string") return false;
    if (url.indexOf("PASTE_WEB_APP_URL_HERE") !== -1) return false;
    if (/^https:\/\/.+/i.test(url)) return true;
    /* Loopback http is for a local mock during testing. The live value is https. */
    return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test(url);
  }

  function decodeEmail(raw) {
    if (!raw) return "";
    var e = String(raw).trim();
    if (e.indexOf("%") !== -1) {
      try { e = decodeURIComponent(e); } catch (err) {}
    }
    return e.trim();
  }

  function cleanName(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function bind(doc, win, endpoint) {
    var loadedAt = Date.now();
    var forms = doc.querySelectorAll("form[data-fan-signup]");
    for (var i = 0; i < forms.length; i++) {
      setupForm(forms[i], win, endpoint, loadedAt);
    }
  }

  function setupForm(form, win, endpoint, loadedAt) {
    var root = form.parentNode;
    var emailInput = form.querySelector("input[name='email']");
    var nameInput = form.querySelector("input[name='firstName']");
    var trap = form.querySelector("input[name='company_fax']");
    var errorEl = form.querySelector("[data-fan-error]");
    var thanksEl = root ? root.querySelector("[data-fan-thanks]") : null;
    var button = form.querySelector("button[type='submit']");
    var pending = false;

    var params;
    try { params = new URLSearchParams(win.location.search); }
    catch (err) { params = null; }
    var prefill = params ? decodeEmail(params.get("EMAIL") || params.get("email") || "") : "";
    if (emailInput && prefill) emailInput.value = prefill;

    function clearError() {
      if (!errorEl) return;
      errorEl.textContent = "";
      errorEl.hidden = true;
    }

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    function showThanks(msg) {
      clearError();
      form.hidden = true;
      if (!thanksEl) return;
      thanksEl.textContent = msg;
      thanksEl.hidden = false;
    }

    if (emailInput) emailInput.addEventListener("input", clearError);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (pending) return;
      clearError();

      /* A filled honeypot is dropped quietly, so a bot is not told it missed. */
      if (trap && String(trap.value || "").trim() !== "") {
        showThanks(THANKS);
        return;
      }

      var email = normalizeEmail(emailInput && emailInput.value);
      if (!isValidEmail(email)) {
        showError(BAD_EMAIL);
        return;
      }

      if (tooSoon(loadedAt, Date.now())) {
        showError(WAIT);
        return;
      }

      if (!endpointReady(endpoint)) {
        showThanks(PREVIEW);
        return;
      }

      pending = true;
      if (button) button.disabled = true;

      var payload = {
        email: email,
        firstName: cleanName(nameInput && nameInput.value),
        source: (win.location && win.location.pathname) || "/",
        userAgent: String((win.navigator && win.navigator.userAgent) || "").slice(0, 400),
        company_fax: "",
        loadedAt: loadedAt
      };

      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        showThanks(THANKS);
      }

      /* no-cors cannot read the Apps Script reply, and the web app's
         redirect often rejects the promise after the POST was accepted. */
      try {
        win.fetch(endpoint, {
          method: "POST",
          mode: "no-cors",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        }).then(finish, finish);
      } catch (err) {
        finish();
      }
    });
  }

  return {
    MIN_MS: MIN_MS,
    THANKS: THANKS,
    PREVIEW: PREVIEW,
    WAIT: WAIT,
    BAD_EMAIL: BAD_EMAIL,
    normalizeEmail: normalizeEmail,
    isValidEmail: isValidEmail,
    tooSoon: tooSoon,
    endpointReady: endpointReady,
    decodeEmail: decodeEmail,
    cleanName: cleanName,
    bind: bind
  };
});
