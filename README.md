# Jumpfigure

Fetches news from RSS feeds (CNBC, CoinDesk, TechCrunch), summarizes every
article with the Gemini API in a single request, and writes a daily report to
`output/daily.md` (and `output/daily.html`). Can run locally or fully automated
in the cloud via GitHub Actions with a 7am email.

## Project structure

```
jumpfigure/
├─ src/
│  ├─ main.js        # orchestration: fetch → summarize → write md + html
│  ├─ fetch.js       # pull & normalize RSS items
│  ├─ summarize.js   # Gemini call (all articles in ONE request)
│  └─ env.js         # loads .env (override) before anything reads process.env
├─ .github/workflows/
│  └─ daily-digest.yml   # cloud schedule + email
├─ output/           # generated (git-ignored)
├─ .env.example
└─ package.json
```

## Run locally

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# put your free Gemini key in .env  → https://aistudio.google.com/apikey
npm start
```

Output lands in `output/daily.md` and `output/daily.html` (overwritten each run).

## Run in the cloud (daily 7am email) — GitHub Actions

The workflow in `.github/workflows/daily-digest.yml` runs the script on GitHub's
servers every morning and emails the result, so your PC doesn't need to be on.

1. **Push this project to a GitHub repo.**
2. **Create a Gmail App Password** (the script sends mail through your Gmail):
   - Enable 2-Step Verification: https://myaccount.google.com/security
   - Create an app password: https://myaccount.google.com/apppasswords
     → copy the 16-character password.
3. **Add repository secrets** (repo → Settings → Secrets and variables → Actions
   → New repository secret):
   | Secret | Value |
   |--------|-------|
   | `GEMINI_API_KEY` | your Gemini API key |
   | `MAIL_USERNAME`  | your Gmail address |
   | `MAIL_PASSWORD`  | the 16-char Gmail app password |
4. **Enable Actions** (Actions tab), then test with **Run workflow**
   (`workflow_dispatch`). Check your inbox.

The recipient is set in the workflow's `to:` field. The schedule is `0 0 * * *`
(00:00 UTC = 07:00 WIB) — see the comments in the workflow for other timezones.

## Notes / tuning

- **Free-tier limits:** Gemini's free tier allows ~20 requests/day and ~10/min
  *per model*. This project sends **one request per run** (all articles batched),
  so a daily run stays comfortably within the free tier.
- **Articles per feed:** change `MAX_ARTICLES_PER_FEED` in `src/fetch.js`.
- **Model / quality:** change `MODEL` in `src/summarize.js`
  (e.g. `gemini-2.5-flash-lite` for an even lighter model).
