/**
 * Fan signup web app for the album sites.
 *
 * Deploy as a web app: execute as me, anyone can access.
 * Setup steps are in README.md next to this file.
 *
 * The page POSTs JSON as text/plain (so the browser skips a CORS preflight).
 * A filled honeypot, a too-fast submit, or a bad email is not stored.
 * Apps Script web apps do not receive the request User-Agent header, so the
 * page sends it in the body.
 */

var TIMEZONE = "America/New_York";
var MIN_MS = 3000;
var MAX_AGE_MS = 2 * 60 * 60 * 1000;
var HEADERS = ["timestamp", "email", "first_name", "source", "user_agent"];
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doGet() {
  return ContentService
    .createTextOutput("Fan signup. Send a POST to add a row.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data = parseBody_(e);
    var result = record_(data);
    return json_(result);
  } catch (err) {
    return json_({ ok: false, error: "could not save" });
  }
}

function parseBody_(e) {
  var contents = e && e.postData && e.postData.contents;
  if (contents) {
    try {
      var parsed = JSON.parse(contents);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {}
  }
  return (e && e.parameter) || {};
}

function record_(data) {
  data = data || {};
  if (String(data.company_fax || "").trim() !== "") {
    return { ok: true };
  }

  if (tooFast_(data.loadedAt)) {
    return { ok: true };
  }

  var email = String(data.email || "").trim().toLowerCase();
  if (!isValidEmail_(email)) {
    return { ok: false, error: "invalid email" };
  }

  var firstName = clip_(data.firstName || data.first_name || "", 80);
  var source = clip_(data.source || "", 200);
  var userAgent = clip_(data.userAgent || data.user_agent || "", 400);

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = spreadsheet_().getSheets()[0];
    var headers = ensureHeaders_(sheet);
    var emailCol = columnIndex_(headers, "email");
    if (emailCol < 0) emailCol = 1;
    if (alreadyListed_(sheet, emailCol, email)) {
      return { ok: true, duplicate: true };
    }
    var row = headers.map(function (header) {
      if (header === "timestamp") return timestamp_();
      if (header === "email") return textCell_(email);
      if (header === "first_name") return textCell_(firstName);
      if (header === "source") return textCell_(source);
      if (header === "user_agent") return textCell_(userAgent);
      return "";
    });
    sheet.appendRow(row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function tooFast_(loadedAt) {
  var started = Number(loadedAt);
  if (!isFinite(started)) return true;
  var elapsed = Date.now() - started;
  if (elapsed < 0) return false;
  if (elapsed > MAX_AGE_MS) return true;
  return elapsed < MIN_MS;
}

function isValidEmail_(email) {
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

function clip_(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function timestamp_() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function textCell_(value) {
  var text = String(value || "");
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function spreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("No spreadsheet. Open this script from the sheet, or set script property SPREADSHEET_ID.");
  }
  return ss;
}

function ensureHeaders_(sheet) {
  var width = HEADERS.length;
  var first = sheet.getRange(1, 1, 1, width).getValues()[0];
  var blank = true;
  var i;
  for (i = 0; i < first.length; i++) {
    if (String(first[i] || "").trim() !== "") blank = false;
  }
  if (blank && sheet.getLastRow() <= 1) {
    sheet.getRange(1, 1, 1, width).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return HEADERS.slice();
  }
  return first.map(function (header) {
    return String(header || "").trim();
  });
}

function columnIndex_(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === name) return i;
  }
  return -1;
}

function alreadyListed_(sheet, emailCol, email) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var values = sheet.getRange(2, emailCol + 1, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim().toLowerCase() === email) return true;
  }
  return false;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
