# Release

How to cut a release of LoLDraftTool and what the CI/CD pipeline produces.

Related files:

- `.github/workflows/ci.yml` — checks on every push to `main` and every PR
- `.github/workflows/release.yml` — builds, packages and publishes
- `installer/LoLDraftTool.iss` — Inno Setup installer script
- `host/LoLDraftTool.Host.csproj` — version properties

## Cut a tagged release

1. Decide the version `X.Y.Z` (semver). There is no version file to bump — the
   pipeline derives the version from the git tag.

2. Create and push the tag:

   ```powershell
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   Pushing a `v*` tag triggers `.github/workflows/release.yml`.

3. Watch the run under **Actions → Release**. On success it creates a GitHub
   Release for the tag with auto-generated notes and two assets attached.

Pre-release flag: a tag starting with `v0.` or containing a `-` (e.g.
`v1.0.0-rc1`) is published as a GitHub **pre-release**; anything else is a full
release.

## What the pipeline produces

Both artifacts are built on `windows-latest` from the self-contained, single-file
publish output (`dotnet publish ... -p:PublishSingleFile=true`):

- **Portable zip** — `LoLDraftTool-<version>-win-x64-portable.zip`, containing
  `LoLDraftTool.exe` and the `wwwroot/` folder. Unzip anywhere and run the exe.
- **Installer** — `LoLDraftTool-<version>-win-x64-setup.exe`, an Inno Setup
  installer (per-user by default, elevatable to all-users; Start Menu shortcut,
  optional desktop shortcut, uninstaller).

`<version>` is the tag without the leading `v` for tagged releases, and
`0.0.0-main.<shortsha>` for `main` builds.

Every run also uploads both files as **workflow artifacts** (retrievable from the
run page even when nothing is published — e.g. `workflow_dispatch` runs).

## The `main-latest` rolling build

Every push to `main` runs the release workflow and updates a single rolling
pre-release:

- The `main-latest` git tag is force-moved to the pushed commit.
- The GitHub pre-release named **"Latest main build"** (tag `main-latest`) has its
  assets replaced with the freshly built portable zip and installer. These two
  assets use stable, unversioned names
  (`LoLDraftTool-main-latest-win-x64-portable.zip` and
  `LoLDraftTool-main-latest-win-x64-setup.exe`) so each push overwrites them
  rather than accumulating sha-named files; the exact version/sha is in the
  release body. The release is marked `make_latest: false`, so it never becomes
  the repo's "Latest" release — tagged releases keep that spot.

This gives testers a permanent "latest development build" link without cluttering
the release list. It is always a pre-release and always unsigned.

`workflow_dispatch` runs build and upload the artifacts but do **not** publish any
release — use them to inspect a build without shipping it.

## WebView2 runtime

The app requires the Microsoft Edge WebView2 Runtime (preinstalled on Windows 11
and with current Edge). The installer checks the runtime's registry key and, if it
is missing, downloads and silently installs the Evergreen bootstrapper before
installing the app. If that download fails, the installer shows the manual
download URL and continues (non-fatal). The portable zip does no such check — on a
machine without the runtime the exe shows a message box with the download link and
exits.

## Unsigned binaries / SmartScreen

The binaries are **not code-signed**. On first download and launch, Windows
SmartScreen will likely show an "unrecognized app" / "Windows protected your PC"
warning; the user clicks **More info → Run anyway**. Reputation improves with
download volume but only signing removes the warning reliably, and Smart App
Control blocks unsigned apps outright.

### Where SignPath signing would plug in

Code signing is intentionally not wired up yet. When it is, follow the pattern in
the sibling `claude-mons` repo (`.github/workflows/release.yml`):

- Add a signing step in `release.yml` **after packaging and before the publish
  steps** (see the `--- SignPath (optional, not enabled) ---` comment block there
  for the exact location). Sign `dist-release/*.exe` (both the portable-zip's exe
  before zipping, and the built installer).
- Gate it on repository secrets (`SIGNPATH_API_TOKEN`,
  `SIGNPATH_ORGANIZATION_ID`) and a variable (`SIGNPATH_PROJECT_SLUG`), plus a
  `SIGNPATH_ENABLED` switch, so the workflow still produces unsigned builds when
  signing is not configured.
- Use `release-signing` for `v*` tags and `test-signing` for manual runs.

## Local dry run

You can reproduce the packaging locally (no push required):

```powershell
pnpm build
dotnet publish host -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:Version=0.1.0
$publish = "host/bin/Release/net10.0-windows/win-x64/publish"
New-Item -ItemType Directory -Force dist-release | Out-Null
Compress-Archive -Path "$publish/LoLDraftTool.exe","$publish/wwwroot" -DestinationPath "dist-release/LoLDraftTool-0.1.0-win-x64-portable.zip" -Force
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DMyAppVersion=0.1.0 /Odist-release installer\LoLDraftTool.iss
```

Outputs land in `dist-release/` (git-ignored).
