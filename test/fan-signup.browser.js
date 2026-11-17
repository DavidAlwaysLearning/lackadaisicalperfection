/* Headless check of the subscribe form against a local mock endpoint.
   Run: NODE_PATH=/tmp/fan-signup-deps/node_modules node test/fan-signup.browser.js
   Requires puppeteer-core and Google Chrome. Does not change FAN_SIGNUP_ENDPOINT. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "..");
const api = require(path.join(root, "assets/fan-signup.js"));
const chrome = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const shots = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf"
};

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? " — " + detail : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function htmlPages() {
  const out = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (name === ".git" || name === "node_modules" || name === "test" || name === "tools") continue;
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith(".html")) out.push(abs);
    }
  }
  walk(root);
  return out;
}

function signupPages() {
  return htmlPages().filter((file) => fs.readFileSync(file, "utf8").includes("data-fan-signup"));
}

function pageUrl(file) {
  let rel = path.relative(root, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
}

async function startMock() {
  const posts = [];
  const server = await listen((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      let json = null;
      try { json = JSON.parse(body); } catch (err) { json = null; }
      posts.push({
        method: req.method,
        url: req.url,
        body,
        json,
        contentType: req.headers["content-type"] || ""
      });
      res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      res.end("ok");
    });
  });
  const { port } = server.address();
  return { server, posts, url: `http://127.0.0.1:${port}/signup` };
}

async function startSite() {
  let endpointOverride = null;
  const server = await listen((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(file);
    res.setHeader("Cache-Control", "no-store");
    if (rel === "/assets/fan-signup.js" && endpointOverride) {
      const original = fs.readFileSync(file, "utf8");
      const js = original.replace(
        /var FAN_SIGNUP_ENDPOINT = "[^"]*";/,
        "var FAN_SIGNUP_ENDPOINT = " + JSON.stringify(endpointOverride) + ";"
      );
      if (js === original || js.includes("script.google.com")) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("refusing to serve the real signup endpoint from the mock suite");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[".js"] });
      res.end(js);
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  const { port } = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    setEndpoint(url) { endpointOverride = url; }
  };
}

async function waitFor(check, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return true;
    await sleep(40);
  }
  return await check();
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  const mock = await startMock();
  const site = await startSite();
  site.setEndpoint(mock.url);
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const pages = signupPages().map((file) => path.relative(root, file).split(path.sep).join("/"));
    const onlySubscribe = pages.length === 1 && pages[0] === "subscribe/index.html";
    record(
      "Form is on every page that had a signup",
      onlySubscribe,
      onlySubscribe
        ? "subscribe/index.html was the only Mailchimp form"
        : "found " + pages.join(", ")
    );

    const browserPage = await browser.newPage();
    await browserPage.setCacheEnabled(false);
    await browserPage.setViewport({ width: 960, height: 1100, deviceScaleFactor: 1 });
    const consoleErrors = [];
    const pageErrors = [];
    const mailchimp = [];
    const googlePosts = [];
    browserPage.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    browserPage.on("pageerror", (err) => pageErrors.push(String(err)));
    browserPage.on("request", (req) => {
      if (/list-manage|mailchimp|chimpstatic|mc\.us\d/i.test(req.url())) mailchimp.push(req.url());
      if (req.method() === "POST" && /script\.google\.com|googleusercontent\.com/i.test(req.url())) {
        googlePosts.push(req.url());
      }
    });
    browserPage.on("requestfailed", (req) => {
      if (/list-manage|mailchimp|chimpstatic|mc\.us\d/i.test(req.url())) mailchimp.push(req.url());
    });

    for (const file of htmlPages()) {
      const route = pageUrl(file);
      const response = await browserPage.goto(site.origin + route, { waitUntil: "domcontentloaded", timeout: 20000 });
      const status = response ? response.status() : 0;
      const rel = path.relative(root, file);
      if (status !== 200) record(`Page loads ${rel}`, false, "status " + status);
    }
    record(
      "Every HTML page loads",
      results.filter((item) => item.name.startsWith("Page loads ") && !item.ok).length === 0,
      htmlPages().length + " pages"
    );

    await browserPage.goto(site.origin + "/subscribe/", { waitUntil: "domcontentloaded", timeout: 20000 });
    const formState = await browserPage.evaluate(() => {
      const form = document.querySelector("form[data-fan-signup]");
      if (!form) return { ok: false, reason: "missing form" };
      const email = form.querySelector("input[name='email']");
      const name = form.querySelector("input[name='firstName']");
      const trap = form.querySelector("input[name='company_fax']");
      const button = form.querySelector("button[type='submit']");
      const emailBox = email.getBoundingClientRect();
      const nameBox = name.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      const trapBox = trap.getBoundingClientRect();
      const visible = (box) => box.width > 40 && box.height > 20 && box.top < window.innerHeight && box.left >= 0;
      return {
        ok: !!(email && name && trap && button && visible(emailBox) && visible(nameBox) && visible(buttonBox) && trapBox.left < -1000 && !name.required && email.required),
        email: visible(emailBox),
        name: visible(nameBox),
        button: visible(buttonBox),
        trapLeft: trapBox.left,
        nameOptional: !name.required,
        emailRequired: email.required
      };
    });
    record(
      "Subscribe form renders (email, optional first name, hidden honeypot, button)",
      formState.ok === true,
      JSON.stringify(formState)
    );

    async function readSignup() {
      return browserPage.evaluate(() => {
        const error = document.querySelector("[data-fan-error]");
        const thanks = document.querySelector("[data-fan-thanks]");
        const form = document.querySelector("form[data-fan-signup]");
        const shown = (el) => !!el && getComputedStyle(el).display !== "none";
        return {
          error: error ? error.textContent : "",
          errorHidden: !shown(error),
          thanks: thanks ? thanks.textContent : "",
          thanksHidden: !shown(thanks),
          formHidden: !shown(form),
          email: (document.querySelector("input[name='email']") || {}).value || ""
        };
      });
    }

    await browserPage.goto(site.origin + "/subscribe/?email=fan%40example.com", { waitUntil: "domcontentloaded", timeout: 20000 });
    let state = await readSignup();
    record("Prefill from ?email=", state.email === "fan@example.com", state.email);

    await browserPage.goto(site.origin + "/subscribe/?EMAIL=Other%40Example.com", { waitUntil: "domcontentloaded", timeout: 20000 });
    state = await readSignup();
    record("Prefill from ?EMAIL=", state.email === "Other@Example.com", state.email);

    const beforePosts = mock.posts.length;
    await browserPage.goto(site.origin + "/subscribe/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await browserPage.$eval("#EMAIL", (el) => { el.value = "not-an-email"; });
    await browserPage.click("button[type='submit']");
    await sleep(400);
    state = await readSignup();
    record(
      "Invalid email is rejected on the page",
      state.error === api.BAD_EMAIL && state.thanksHidden && !state.formHidden && mock.posts.length === beforePosts,
      state.error || "(no message)"
    );

    await browserPage.$eval("#EMAIL", (el) => { el.value = "a@b"; });
    await browserPage.click("button[type='submit']");
    await sleep(300);
    state = await readSignup();
    record(
      "Email without a real domain is rejected",
      state.error === api.BAD_EMAIL && mock.posts.length === beforePosts,
      state.error || "(no message)"
    );

    await browserPage.goto(site.origin + "/subscribe/", { waitUntil: "domcontentloaded", timeout: 20000 });
    const postsAtHoneypot = mock.posts.length;
    await browserPage.$eval("#EMAIL", (el) => { el.value = "bot@example.com"; });
    await browserPage.$eval("#company_fax", (el) => { el.value = "https://spam.example"; });
    await browserPage.click("button[type='submit']");
    await sleep(500);
    state = await readSignup();
    record(
      "Honeypot submit is not sent",
      state.thanks === api.THANKS && !state.thanksHidden && state.formHidden && mock.posts.length === postsAtHoneypot,
      `posts ${mock.posts.length - postsAtHoneypot}, thanks "${state.thanks}"`
    );

    await browserPage.goto(site.origin + "/subscribe/", { waitUntil: "domcontentloaded", timeout: 20000 });
    const postsAtFast = mock.posts.length;
    await browserPage.$eval("#EMAIL", (el) => { el.value = "fast@example.com"; });
    await browserPage.$eval("#FNAME", (el) => { el.value = "Ada"; });
    await browserPage.click("button[type='submit']");
    await sleep(500);
    state = await readSignup();
    record(
      "Submit under 3 seconds is blocked",
      state.error === api.WAIT && state.thanksHidden && !state.formHidden && mock.posts.length === postsAtFast,
      state.error || "(no message)"
    );

    const opened = Date.now();
    await browserPage.goto(site.origin + "/subscribe/?email=Reader%40Example.com", { waitUntil: "domcontentloaded", timeout: 20000 });
    await browserPage.$eval("#FNAME", (el) => { el.value = "Ada"; });
    await browserPage.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
    await sleep(200);
    const beforePath = path.join(shots, "signup_form_before.png");
    await browserPage.screenshot({ path: beforePath, fullPage: true });
    record("Screenshot of the form before submit", fs.existsSync(beforePath), beforePath);

    const remain = 3500 - (Date.now() - opened);
    if (remain > 0) await sleep(remain);
    const postsAtSend = mock.posts.length;
    const expectedAgent = await browserPage.evaluate(() => navigator.userAgent);
    await browserPage.click("button[type='submit']");
    const arrived = await waitFor(() => mock.posts.length > postsAtSend, 3000);
    await waitFor(async () => {
      const current = await readSignup();
      return current.thanks === api.THANKS && !current.thanksHidden && current.formHidden;
    }, 3000);
    state = await readSignup();
    const post = mock.posts[mock.posts.length - 1];
    const payload = post && post.json;
    const payloadOk = !!(arrived && payload
      && post.method === "POST"
      && /text\/plain/i.test(post.contentType)
      && payload.email === "reader@example.com"
      && payload.firstName === "Ada"
      && payload.source === "/subscribe/"
      && payload.company_fax === ""
      && payload.userAgent === expectedAgent
      && typeof payload.loadedAt === "number"
      && Date.now() - payload.loadedAt >= 3000
      && Date.now() - payload.loadedAt < 60000);
    record(
      "Normal submit POSTs the expected payload",
      payloadOk,
      payload ? JSON.stringify(payload) : (post ? post.body : "no request")
    );
    record(
      "Thank-you message shows after submit",
      state.thanks === api.THANKS && !state.thanksHidden && state.formHidden,
      state.thanks || "(hidden)"
    );
    const afterPath = path.join(shots, "signup_form_after.png");
    await browserPage.screenshot({ path: afterPath, fullPage: true });
    record("Screenshot of the thank-you after submit", fs.existsSync(afterPath), afterPath);

    site.setEndpoint(null);
    await browserPage.goto(site.origin + "/subscribe/", { waitUntil: "domcontentloaded", timeout: 20000 });
    const liveEndpoint = await browserPage.evaluate(() => window.FAN_SIGNUP_ENDPOINT);
    record(
      "Unmocked page points at the deployed web app and is not submitted here",
      liveEndpoint === "https://script.google.com/macros/s/AKfycbzF4JFcLWCxvtPqP-k0oJMKwBOW5JfXHHwmYI-D8UrYUb-4iovsnK9Y469M2F64bBk-pw/exec",
      liveEndpoint || "(missing)"
    );

    const ourConsole = consoleErrors.filter((text) => !/facebook|fbevents|goatcounter|gc\.zgo\.at|connect\.facebook/i.test(text));
    const thirdParty = consoleErrors.filter((text) => /facebook|fbevents|goatcounter|gc\.zgo\.at|connect\.facebook/i.test(text));
    record(
      "No console errors from the site",
      pageErrors.length === 0 && ourConsole.length === 0,
      pageErrors.concat(ourConsole).slice(0, 4).join(" | ") || "none"
    );
    record(
      "No Mailchimp requests",
      mailchimp.length === 0,
      mailchimp.slice(0, 3).join(" | ") || "none"
    );
    record(
      "Mock suite does not post to the real web app",
      googlePosts.length === 0,
      googlePosts.join(" | ") || "none"
    );
    if (thirdParty.length) {
      record("Third-party tracker console noise", true, thirdParty.length + " message(s) from Facebook or GoatCounter, ignored");
    }

    await browserPage.close();
  } finally {
    await browser.close();
    site.server.close();
    mock.server.close();
  }

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
