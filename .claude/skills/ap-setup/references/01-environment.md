# 01 — Environment & working directory

Goal: the repo runs on this Mac, and there's a working directory under OneDrive where state (settings, vendors, ledger, reports, PDF backups) lives — separate from the synced skill code.

## 1. Node + dependencies

```bash
node --version   # need v18+; if missing, install Node LTS (brew install node)
cd <repo>        # the ap-automation clone
npm install      # installs playwright; postinstall runs `playwright install chromium`
```

Gate: `npm run serve:mock` starts a server on http://127.0.0.1:4321 (Ctrl-C to stop). If Chromium didn't install, run `npx playwright install chromium`.

## 2. Find the OneDrive root and confirm it materializes files

Locate the OneDrive folder Ian's AP files live in. It's usually one of:

```bash
ls ~/Library/CloudStorage/ 2>/dev/null        # modern macOS OneDrive path
ls ~/OneDrive* 2>/dev/null
```

Find the folder that contains `New Scans/`, `Suppliers/`, `Statements/`, etc. Then **confirm Files-On-Demand isn't leaving placeholders**: open one invoice folder and check the files are real, not 0-byte cloud stubs.

```bash
# replace with the real path
AP_ONEDRIVE="$HOME/Library/CloudStorage/OneDrive-.../Right Mfg AP"
du -sh "$AP_ONEDRIVE/New Scans" 2>/dev/null    # non-trivial size => materialized
```

If files show as placeholders, right-click the AP root in Finder → "Always keep on this device," or set it in OneDrive preferences. The run needs real bytes to OCR.

## 3. Create the working area and wire the path

```bash
mkdir -p "$AP_ONEDRIVE/_AP Automation"/{reports,pdf-backups}
```

Tell the engine where that is. Two ways — pick the file method (survives new shells):

```bash
# writes src/runtime-path.json = { "workDir": "<abs path>" }
node -e 'import("node:fs").then(fs=>fs.writeFileSync("src/runtime-path.json", JSON.stringify({workDir: process.argv[1]},null,2)))' "$AP_ONEDRIVE/_AP Automation"
cat src/runtime-path.json
```

(`runtime-path.json` is gitignored and is the only machine-specific path file.)

## 4. Copy the config templates into the working area

```bash
cp config.example/settings.json "$AP_ONEDRIVE/_AP Automation/settings.json"
cp config.example/vendors.json  "$AP_ONEDRIVE/_AP Automation/vendors.json"
```

You'll finalize `vendors.json` in step 05 and the go-live switches in `settings.json` in step 07. For now leave `dry_run: true` and `seed_mode: false`.

## Gate

- `npm run serve:mock` works.
- The OneDrive AP folder is found and materializes real files.
- `<workDir>/settings.json` and `vendors.json` exist; `src/runtime-path.json` points at `<workDir>`.
- Sanity check the engine sees the working dir:

```bash
node -e 'import("./src/runtime.js").then(m=>console.log(m.paths()))'
```

It should print the OneDrive `_AP Automation` paths (not the repo `data/work` fallback).
