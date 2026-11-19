# Bihar on NFMS

A daily-updated dashboard comparing **Bihar, SBPDCL and NBPDCL** with every state and DISCOM on the
[National Feeder Monitoring System](https://nfms.powermin.gov.in/dashboard) (Ministry of Power / RECPDCL):
hours of supply by feeder category, SAIDI/SAIFI, feeder integration and smart-meter coverage, plus
Patna City's place in NFMS's monthly major-cities reliability report.

**Dashboard:** https://mdsbpdcl-hub.github.io/nfms-bihar/ (after GitHub Pages is switched on, see below)

## How it updates

`.github/workflows/update-data.yml` runs every night at 22:11 IST (NFMS figures settle after 21:30) and can be run
by hand from the **Actions** tab → *Update NFMS data* → *Run workflow*.

1. `scripts/collect.mjs` opens the public NFMS dashboard in a headless browser, picks each State/UT and DISCOM in
   its drop-downs, and saves the figures the dashboard shows.
2. `scripts/cities.py` downloads the latest monthly *Major Cities Cumulative SAIFI SAIDI* PDFs and reads the tables.
3. Changed files in `data/` are committed; GitHub Pages republishes the dashboard automatically.

If a run collects fewer than 25 states or misses Bihar, it stops and the previous data stays in place.

## Data files

| File | What it holds |
|---|---|
| `data/latest.json`, `data/latest.csv` | Latest figures, one row per state, DISCOM and India |
| `data/history.csv` | Every daily snapshot (`snapshot_date` + the same columns) — drives the "Day by day" chart |
| `data/cities.json` | Monthly major-cities SAIDI/SAIFI reports |

Columns: hours of supply (`hos_incl_agri`, `hos_excl_agri`, `urban`, `rural`, `agri`, `industrial`, `mixed`),
`saidi` (hrs) and `saifi` from the NFMS reliability tile for the latest day, feeder counts, integration %,
communication %, smart-meter / AMR / RT-DAS share, and `data_date` (each utility's last refreshed day).

## One-time setup

1. **Pages:** Settings → Pages → *Build and deployment* → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
2. **Actions write access:** Settings → Actions → General → *Workflow permissions* → *Read and write permissions* → Save.
3. Run the workflow once from the Actions tab to check it works.

### If the nightly run fails with HTTP 401/403

NFMS may refuse visits from outside India, and GitHub's own runners are abroad. Then run the job on any
always-on computer in India (an office PC or a small VM):

1. Settings → Actions → Runners → *New self-hosted runner*, and follow the steps on that computer.
2. Settings → Secrets and variables → Actions → *Variables* → add `NFMS_RUNNER` = `self-hosted`.

The workflow then runs there instead; nothing else changes.

## Run locally

```bash
npm install && npx playwright install chromium
pip install pdfplumber
node scripts/collect.mjs           # all states
STATES=BR node scripts/collect.mjs # quick test, writes data/test.json
python scripts/cities.py
python -m http.server              # then open http://localhost:8000
```

Data is shown as furnished by utilities to NFMS. This is an independent view of public data.
