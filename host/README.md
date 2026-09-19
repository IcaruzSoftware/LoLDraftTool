# LoLDraftTool desktop shell (WPF + WebView2)

A thin .NET 10 WPF window that hosts the Vite web app (`app/`) inside a WebView2
control. The C# here never changes with the UI: it maps the built frontend to a
virtual host and points WebView2 at it. See
[`docs/architecture.md`](../docs/architecture.md) (Stack → Shell) and
[`docs/research/tech-stack.md`](../docs/research/tech-stack.md) §3.4 / §6.

## How it works

- **Release:** the build copies `app/dist/**` into `wwwroot/` next to the exe.
  At startup the host maps `https://app/` to that folder
  (`SetVirtualHostNameToFolderMapping`) and navigates to
  `https://app/index.html`. Content files are copied loose beside the exe, not
  embedded, even in single-file publish.
- **Dev:** launched with `--dev`, the host navigates to a running Vite dev server
  for hot module reload instead of the packaged files.
- WebView2 keeps its user-data folder under
  `%LOCALAPPDATA%\LoLDraftTool\WebView2`.

## Command-line flags

| Flag | Effect |
|---|---|
| `--dev` | Navigate to `http://localhost:5173` (Vite dev server). |
| `--dev=<url>` | Navigate to `<url>` (e.g. `--dev=http://localhost:4173`). |
| `--devtools` | Enable DevTools and the right-click context menu in a release build. |

In dev mode the context menu, DevTools and browser accelerator keys (F12,
refresh) are enabled. In a release build they are all disabled unless
`--devtools` is passed; F12 is only ever available in dev mode. The status bar
and zoom control are always disabled.

## Run in development

```powershell
# terminal 1: start the Vite dev server (HMR)
pnpm dev

# terminal 2: launch the host pointing at it
dotnet run --project host -- --dev
# or, from the repo root:
pnpm host:run
```

## Build a release

```powershell
# 1. build the frontend
pnpm build

# 2. publish a self-contained, single-file exe
dotnet publish host -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
# or, from the repo root:
pnpm host:publish
```

Output:

- Exe: `host/bin/Release/net10.0-windows/win-x64/publish/LoLDraftTool.exe`
- Alongside it: `wwwroot/` (the frontend). The WebView2 native loader is bundled
  into the single-file exe and extracted at runtime.
- Size: the self-contained single-file exe is roughly **125-130 MB** (the .NET
  desktop runtime and WebView2 dominate); `wwwroot/` adds a few MB of champion
  images.

### Framework-dependent alternative (much smaller)

```powershell
dotnet publish host -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true
```

This produces a ~3-5 MB exe but requires the **.NET 10 Desktop Runtime** to be
installed on the target machine (Windows 11 does not ship it by default).

## WebView2 runtime

The app needs the Microsoft Edge WebView2 Runtime, which ships with Windows 11
and current Edge installs. If it is missing, the host shows a message box with
the download link (<https://developer.microsoft.com/microsoft-edge/webview2/>)
and exits.
