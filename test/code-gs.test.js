const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createSheet() {
  const rows = [];
  return {
    rows,
    frozen: 0,
    getLastRow() {
      return rows.length;
    },
    setFrozenRows(n) {
      this.frozen = n;
    },
    getRange(row, column, numRows, numColumns) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const line = [];
            const existing = rows[row - 1 + r] || [];
            for (let c = 0; c < numColumns; c++) {
              const value = existing[column - 1 + c];
              line.push(value === undefined ? "" : value);
            }
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          for (let r = 0; r < values.length; r++) {
            const dest = rows[row - 1 + r] || (rows[row - 1 + r] = []);
            for (let c = 0; c < values[r].length; c++) {
              dest[column - 1 + c] = values[r][c];
            }
          }
        }
      };
    },
    appendRow(row) {
      rows.push(row.slice());
    }
  };
}

function loadScript(sheet) {
  const formatCalls = [];
  const props = {};
  const context = {
    console,
    Date,
    Number,
    String,
    JSON,
    isFinite,
    Math,
    RegExp,
    formatCalls,
    sheet,
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheets: () => [sheet] };
      },
      openById(id) {
        return { id, getSheets: () => [sheet] };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock() {},
          releaseLock() {}
        };
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null;
          },
          setProperty(key, value) {
            props[key] = value;
          }
        };
      }
    },
    Utilities: {
      formatDate(date, timeZone, format) {
        formatCalls.push({ date, timeZone, format });
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23"
        }).formatToParts(date);
        const get = (type) => parts.find((part) => part.type === type).value;
        return format
          .replace("yyyy", get("year"))
          .replace("MM", get("month"))
          .replace("dd", get("day"))
          .replace("HH", get("hour"))
          .replace("mm", get("minute"))
          .replace("ss", get("second"));
      }
    },
    ContentService: {
      MimeType: { JSON: "application/json", TEXT: "text/plain" },
      createTextOutput(text) {
        return {
          text,
          mime: null,
          setMimeType(mime) {
            this.mime = mime;
            return this;
          }
        };
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "../tools/fan-signup/Code.gs"), "utf8");
  vm.runInContext(source, context);
  context.props = props;
  return context;
}

function post(ctx, data) {
  const output = ctx.doPost({
    postData: { contents: JSON.stringify(data), type: "text/plain" }
  });
  assert.equal(output.mime, "application/json");
  return JSON.parse(output.text);
}

function saved(ctx) {
  const rows = ctx.sheet.rows;
  if (rows.length === 0) return { headers: [], data: [] };
  return { headers: rows[0], data: rows.slice(1) };
}

test("invalid emails are refused and nothing is written", () => {
  const ctx = loadScript(createSheet());
  const result = post(ctx, {
    email: "not-an-email",
    firstName: "Ada",
    source: "/subscribe/",
    userAgent: "test",
    company_fax: "",
    loadedAt: Date.now() - 10000
  });
  assert.deepEqual(result, { ok: false, error: "invalid email" });
  assert.equal(ctx.sheet.rows.length, 0);

  const empty = post(ctx, {
    email: "   ",
    loadedAt: Date.now() - 10000
  });
  assert.equal(empty.ok, false);
  assert.equal(ctx.sheet.rows.length, 0);
});

test("email is trimmed and lowercased before it is stored", () => {
  const ctx = loadScript(createSheet());
  const result = post(ctx, {
    email: "  Fan@Example.COM ",
    firstName: "  Ada   Lovelace ",
    source: "/subscribe/",
    userAgent: "TestAgent",
    company_fax: "",
    loadedAt: Date.now() - 10000
  });
  assert.deepEqual(result, { ok: true });
  const { headers, data } = saved(ctx);
  assert.deepEqual(headers, ["timestamp", "email", "first_name", "source", "user_agent"]);
  assert.equal(data.length, 1);
  assert.equal(data[0][1], "fan@example.com");
  assert.equal(data[0][2], "Ada Lovelace");
  assert.equal(data[0][3], "/subscribe/");
  assert.equal(data[0][4], "TestAgent");
  assert.match(data[0][0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(ctx.formatCalls[0].timeZone, "America/New_York");
  assert.equal(ctx.formatCalls[0].format, "yyyy-MM-dd HH:mm:ss");
  assert.equal(ctx.sheet.frozen, 1);
});

test("a duplicate email is not added again", () => {
  const ctx = loadScript(createSheet());
  const body = {
    email: "fan@example.com",
    firstName: "Ada",
    source: "/subscribe/",
    userAgent: "test",
    company_fax: "",
    loadedAt: Date.now() - 10000
  };
  assert.deepEqual(post(ctx, body), { ok: true });
  const again = post(ctx, {
    ...body,
    email: "  FAN@example.com ",
    firstName: "Someone else"
  });
  assert.deepEqual(again, { ok: true, duplicate: true });
  assert.equal(saved(ctx).data.length, 1);
  assert.equal(saved(ctx).data[0][2], "Ada");

  const other = post(ctx, { ...body, email: "other@example.com", firstName: "Bea" });
  assert.deepEqual(other, { ok: true });
  assert.equal(saved(ctx).data.length, 2);
  assert.equal(saved(ctx).data[1][1], "other@example.com");
});

test("a filled honeypot is ignored", () => {
  const ctx = loadScript(createSheet());
  const result = post(ctx, {
    email: "bot@example.com",
    firstName: "Bot",
    source: "/subscribe/",
    userAgent: "bot",
    company_fax: "https://spam.example",
    loadedAt: Date.now() - 10000
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(ctx.sheet.rows.length, 0);
});

test("a submit under 3 seconds is ignored", () => {
  const ctx = loadScript(createSheet());
  const fast = post(ctx, {
    email: "fast@example.com",
    firstName: "Ada",
    source: "/subscribe/",
    userAgent: "test",
    company_fax: "",
    loadedAt: Date.now()
  });
  assert.deepEqual(fast, { ok: true });
  assert.equal(ctx.sheet.rows.length, 0);

  const missing = post(ctx, {
    email: "fast@example.com",
    company_fax: ""
  });
  assert.deepEqual(missing, { ok: true });
  assert.equal(ctx.sheet.rows.length, 0);
});
