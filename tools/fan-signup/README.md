# Fan signup

This replaces the Mailchimp form. A page posts the email here, and this script appends a row to a Google Sheet. Nothing in this folder is deployed by itself. David deploys it from his Google account, then pastes the web app URL into `FAN_SIGNUP_ENDPOINT` in `assets/fan-signup.js`.

The sheet columns are:

| Column | Contents |
| --- | --- |
| timestamp | When the row was saved, `America/New_York`, `yyyy-MM-dd HH:mm:ss` |
| email | Lowercased, trimmed |
| first_name | Optional |
| source | Page path, such as `/subscribe/` |
| user_agent | Sent by the page. Apps Script cannot read the request header. |

A submit is not stored when the honeypot field `company_fax` is filled, when `loadedAt` is missing, when it is less than 3 seconds old, or when it is more than 2 hours old. Invalid emails are refused. An email already in the sheet is not added again.

## 1. Create the sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a blank spreadsheet.
2. Name it something you will recognize, such as `Fan signup`.
3. Leave the first tab empty. The script writes the header row on the first save.

## 2. Add the script

1. In the sheet, open **Extensions → Apps Script**.
2. Select the sample `Code.gs` and delete it.
3. Paste the full contents of `tools/fan-signup/Code.gs` from this repo.
4. Click **Save** (the disk icon). Name the project `Fan signup` if asked.

If the script is not opened from that sheet, set a script property named `SPREADSHEET_ID` to the id in the sheet URL (`https://docs.google.com/spreadsheets/d/THIS_PART/edit`).

## 3. Deploy the web app

1. Click **Deploy → New deployment**.
2. Click the gear next to **Select type** and choose **Web app**.
3. Description: `Fan signup`.
4. Execute as: **Me**.
5. Who has access: **Anyone**.
6. Click **Deploy**.
7. Google will ask you to authorize the script. Review the permission (it needs the spreadsheet) and allow it.
8. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/…/exec`.

Use **Anyone**, not **Anyone with a Google account**. Fans are not signed in. If you change the script later, use **Deploy → Manage deployments → Edit → New version**. The URL stays the same.

## 4. Point the site at it

1. Open `assets/fan-signup.js`.
2. Replace `PASTE_WEB_APP_URL_HERE` with the web app URL:

```javascript
var FAN_SIGNUP_ENDPOINT = "https://script.google.com/macros/s/YOUR_ID/exec";
```

3. Commit that change and merge it only when you want the live site to use the sheet. Until this pull request is merged, lackadaisicalperfection.com still has the current signup. Until the placeholder is replaced, the new form shows a thank-you and does not send the email.

## 5. Check a row

`loadedAt` is the page-load time in milliseconds. Use a value at least a few seconds in the past.

```bash
curl -sL -X POST \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"email":"you@example.com","firstName":"Ada","source":"/subscribe/","userAgent":"curl","company_fax":"","loadedAt":'"$(($(date +%s%3N) - 10000))"'}' \
  'https://script.google.com/macros/s/YOUR_ID/exec'
```

A new address returns `{"ok":true}`. The same address again returns `{"ok":true,"duplicate":true}` and does not add a second row. A bad address returns `{"ok":false,"error":"invalid email"}`.
