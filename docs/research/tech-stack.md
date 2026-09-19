# LoLDraftTool – Tech Stack Research

Date: 2026-09-19
Scope: pick the desktop shell + frontend + engine stack for a simple, offline, lightweight Windows 11 champion-select draft tool (two team columns, ban rows, center recommendation panel, searchable champion grid, restart button, JSON/CSV import, ~170 bundled champion squares, no network at runtime, small portable exe or installer).

---

## 1. Executive summary

**Recommendation: Tauri v2 (Rust shell) + Vite + TypeScript frontend, engine in pure TypeScript tested with Vitest.**
**Fallback (zero new installs): .NET 10 WPF window hosting WebView2, same Vite/TypeScript frontend and engine.**

Why:

- The UI is a styled grid with images, search and columns. HTML/CSS is by far the most productive way to mimic the LoL champion-select look. That pushes every serious option toward "web frontend inside a native shell". Once the frontend is web, the engine is naturally TypeScript and Vitest is the obvious test runner.
- Among the web-in-a-shell options, Tauri v2 gives the smallest artifact (portable exe roughly 5–10 MB including the images), a real NSIS installer out of the box, native file dialogs via `<input type="file">` or the dialog plugin, and a good dev loop (`tauri dev` with HMR). WebView2 is already present on this machine (runtime 153.0.4234.32), so the largest Tauri runtime dependency is satisfied.
- The cost of Tauri is a one-time toolchain install: rustup (~5 min) plus the MSVC "Desktop development with C++" workload (~3–7 GB, ~15–30 min). That is the only real blocker and it is entirely local to the dev machine; end users need nothing extra.
- The fallback costs zero installs (dotnet 10 SDK + WebView2 already present) and reuses 100 % of the frontend and engine. It is about 150 lines of C# and produces a ~70 MB self-contained single-file exe (or ~3 MB framework-dependent exe that needs the .NET 10 Desktop Runtime on the target). Keep the frontend's platform access behind a tiny adapter so the shell can be swapped without touching UI or engine code.
- Electron works with zero friction but violates "lightweight" (~85 MB installer, ~250 MB unpacked). Pure WPF/WinUI/Avalonia are viable but styling a game-like UI in XAML is slower than CSS and WinUI 3 deployment is fiddly. Neutralinojs is tiny and toolchain-free but is a much smaller ecosystem with weaker docs and no first-class installer story. PWA lacks the desktop feel and bundling.

---

## 2. What is installed on the developer machine (verified 2026-09-19)

| Item | Status | Detail |
|---|---|---|
| Node | yes | v24.17.0 |
| pnpm | yes | 11.25.0 |
| .NET SDK | yes | 10.0.301; workloads: android, ios, maccatalyst, maui-windows (so Windows App SDK / WinUI 3 bits are present) |
| Python | yes | 3.14.6 |
| Rust / cargo / rustup | **no** | no `~/.cargo`, no `~/.rustup` |
| Visual Studio | yes (2 instances) | VS Community 2026 18.7.3 at `C:\Program Files\Microsoft Visual Studio\18\Community` (workloads: ManagedDesktop, CoreEditor). A second, **prerelease "Insiders" instance** 18.8 at `...\18\Insiders` (only visible with `vswhere -prerelease`). |
| MSVC C++ toolset (`cl.exe` / `link.exe`) | **partial / not usable for linking** | Only the Insiders instance carries `VC\Tools\MSVC\14.51.36231\bin\Hostx64\x64\{cl,link}.exe`, but the toolset **lacks the desktop CRT libs** (`lib\x64\msvcrt.lib` absent; only OneCore CRT packages installed). Component `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` is **not** installed in either instance (`vswhere -requires ...VC.Tools.x86.x64` returns nothing). Neither `cl.exe` nor `link.exe` is on PATH. |
| Windows SDK (headers/libs) | **no** | `C:\Program Files (x86)\Windows Kits\10\bin` is empty, no `Include`/`Lib` folders, no `kernel32.lib` anywhere under Windows Kits, no `HKLM\...\Microsoft SDKs\Windows\v10.0` entry. Only `Microsoft.Windows.SDK.BuildTools_10.0.26100.7705` (signtool etc.) exists. |
| WebView2 Runtime | **yes** | `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-...}` pv = 153.0.4234.32; `C:\Program Files (x86)\Microsoft\EdgeWebView\Application\153.0.4234.32` present; Edge installed. |
| Installer tooling (Inno, NSIS, WiX) | no | none on PATH, no global dotnet tools |
| winget | yes | available |
| Free disk on C: | 1.7 TB | plenty for a C++ workload |

Bottom line for Rust: `cargo build` with the default `x86_64-pc-windows-msvc` target **would fail at link time** today (no `msvcrt.lib`, no `kernel32.lib`). The C++ workload must be installed first. The stray Insiders MSVC folder should not be put on PATH; let the VS Installer add a complete toolset to the Community instance.

---

## 3. Option comparison for this project

### 3.1 Tauri v2 (Rust shell + web frontend)

- **Output size:** hello-world release exe ~4–6 MB; plus ~3–5 MB champion PNGs embedded → ~8–11 MB portable exe. NSIS installer roughly the same (compressed). Uses the system WebView2 (present on Win 11; Tauri's installer can also bootstrap it).
- **Build complexity:** `pnpm tauri build` runs Vite then `cargo build --release`. First Rust build 3–6 min on a normal desktop, incremental ~20–60 s. The Rust side for this app is generated boilerplate; no hand-written Rust is required (file import can be done with `<input type="file">` + `FileReader`, or the `dialog` + `fs` plugins).
- **Install steps on this machine:** rustup (minimal profile) + MSVC C++ workload + Windows 11 SDK. See section 5.1. Estimated 25–45 min wall-clock, mostly download.
- **Risk:** low once the toolchain is in. The known wrinkle here is the half-installed Insiders VC toolset; installing the workload into the Community instance resolves it. Tauri v2 is stable (v2.0 GA Oct 2024, many 2.x releases since), has an official NSIS bundler, dialog/fs plugins, and Vitest works untouched on the frontend.
- **Dev loop:** `pnpm tauri dev` → Vite HMR inside the Tauri window.

### 3.2 Electron

- **Output size:** ~85–100 MB installer, ~230–260 MB unpacked (Chromium + Node). Portable exe via electron-builder ~90–110 MB.
- **Build complexity:** zero native toolchain; `pnpm` only. electron-builder/forge produce NSIS/portable in one command.
- **Risk:** near zero technically; but it contradicts the "simple, lightweight" requirement by an order of magnitude and increases startup time/RAM. Only worth it if the Tauri toolchain install is unacceptable *and* a WPF host is unwanted.

### 3.3 .NET 10 native UI: WPF vs WinUI 3 vs Avalonia

Common: engine in C#, xUnit/NUnit for tests, `dotnet publish -r win-x64 --self-contained -p:PublishSingleFile=true`.

| | WPF | WinUI 3 (Windows App SDK) | Avalonia 11 |
|---|---|---|---|
| Maturity / docs | very mature | moving target; unpackaged deployment and XAML tooling still fiddly | mature, cross-platform |
| Styling game-like UI (gradients, hex frames, glow) | possible, verbose XAML | possible, verbose XAML | possible, CSS-like selectors but still XAML |
| Trimming / NativeAOT | not supported (single-file only, ~65–80 MB self-contained, ~45 MB with compression) | partial; self-contained adds WinAppSDK runtime (~+40 MB) or requires WinAppSDK runtime installer on target | NativeAOT supported → ~25–40 MB single exe |
| Framework-dependent exe | ~2–5 MB but needs .NET 10 Desktop Runtime on target (Win 11 does not ship it) | needs .NET runtime + WinAppSDK runtime | ~5–10 MB, needs .NET runtime |
| Toolchain on this machine | present | present (maui-windows workload) | needs `dotnet new install Avalonia.Templates` only |

Verdict: the UI work (170-image grid with search, two columns, ban rows) is 2–3x slower to style in XAML than in CSS, and none of these gets below Tauri's size. WinUI 3 is the least attractive (deployment friction). WPF or Avalonia are reasonable if a single language (C#) is a hard requirement.

### 3.4 .NET 10 WPF window hosting WebView2 (Vite frontend)

- **How:** WPF project + `Microsoft.Web.WebView2` NuGet; `CoreWebView2.SetVirtualHostNameToFolderMapping("app", "wwwroot", ...)` and `Source = https://app/index.html`. During dev point `Source` at `http://localhost:5173` for HMR. Native dialogs via `Microsoft.Win32.OpenFileDialog` exposed through `AddHostObjectToScript` or `WebMessageReceived`, or simply rely on `<input type="file">` (WebView2 shows the native dialog itself).
- **Size:** self-contained single-file ~65–80 MB (WebView2 loader is small; WPF itself dominates); framework-dependent ~3–5 MB + images.
- **Toolchain:** everything is already installed. Build is `pnpm build` then `dotnet publish`.
- **Risk:** very low. Two languages, but the C# part is ~150 lines and never changes. This is the correct fallback if the Rust toolchain cannot be installed.

### 3.5 Pure web app / PWA served locally

- Import via `<input type="file">`, images via static folder, works today. But: no desktop window chrome, no exe, needs a browser or `pnpm preview`, PWA install on Edge is a browser feature and looks like one. Listed for completeness only; not a "Windows app".

### 3.6 Neutralinojs and similar light wrappers

- **Neutralinojs:** ~2–4 MB binary on Windows using WebView2, no compiler toolchain (`neu create`, `neu build`). Has `os.showOpenDialog` and `filesystem.readFile`. Downsides: small community, thin docs, resources shipped as a separate `resources.neu` file next to the exe (or embedded via `--embed-resources`), no first-class installer, security model is a token-based local WebSocket rather than an in-process IPC. Good enough for a hobby tool, but Tauri does the same thing with better maintenance, and the WPF+WebView2 host does it with zero new tooling and mainstream support.
- **Wails / Photino / Electrobun etc.:** Wails needs Go (not installed); Photino.NET is essentially the WPF+WebView2 approach with a thinner wrapper. No advantage over 3.4.

### 3.7 Scorecard (higher = better, weighted for *this* project)

| Criterion (weight) | Tauri v2 | WPF+WebView2 | Electron | WPF (XAML) | Avalonia | WinUI 3 | Neutralino |
|---|---|---|---|---|---|---|---|
| Artifact size (3) | 5 | 3 | 1 | 3 | 4 | 2 | 5 |
| UI productivity for LoL look (3) | 5 | 5 | 5 | 3 | 3 | 3 | 5 |
| Toolchain friction on this PC (2) | 2 | 5 | 5 | 5 | 5 | 4 | 5 |
| Installer / portable exe story (2) | 5 | 4 | 5 | 4 | 4 | 2 | 2 |
| Ecosystem/maintenance risk (2) | 5 | 5 | 5 | 5 | 4 | 3 | 2 |
| Engine testability (1) | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| **Weighted total (/65)** | **59** | **57** | 51 | 51 | 51 | 39 | 51 |

Tauri wins narrowly on the merits; WPF+WebView2 is within two points and wins if the toolchain install is refused. Both share the same frontend, so the choice is reversible.

---

## 4. Final recommendation

**Primary: Tauri v2 + Vite + TypeScript (vanilla or React) + Vitest.**
Justification: smallest and cleanest deliverable (single ~10 MB portable exe plus an NSIS installer from the same command), CSS for the champion-select look, no hand-written Rust for this feature set, WebView2 already on the machine, mature ecosystem. The one-time ~30–45 min toolchain install is a fixed cost with 1.7 TB of disk available.

**Architecture rule to keep the fallback cheap:** the frontend must access the platform only through one small module, e.g. `src/platform/index.ts` exposing `pickAndReadTextFile(): Promise<{name, text} | null>`. Implement it with `<input type="file">` + `FileReader` (works identically in Tauri and WebView2). Nothing else in the UI or engine may import Tauri APIs. Then switching from the Tauri shell to a WPF WebView2 host is a shell-only change.

**Fallback: .NET 10 WPF + WebView2 host** for the identical `dist/` folder. Use if the MSVC workload install fails or is unwanted.

Engine language: TypeScript. Reasons: same language as the UI, Vitest is instant, no IPC boundary between recommendations and UI, and the fallback shell does not care.

---

## 5. Implementation guide for the recommended stack

### 5.1 One-time toolchain install (Tauri)

Order matters: install the C++ toolset first so rustup does not try to launch its own VS installer.

1. **MSVC + Windows 11 SDK** into the existing VS Community 2026 instance (the "Desktop development with C++" workload). Run in an elevated PowerShell:

   ```powershell
   & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe" modify `
     --installPath "C:\Program Files\Microsoft Visual Studio\18\Community" `
     --add Microsoft.VisualStudio.Workload.NativeDesktop `
     --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
     --add Microsoft.VisualStudio.Component.Windows11SDK.26100 `
     --passive --norestart
   ```

   Minimal alternative (no IDE parts, only what Rust needs): drop `--add Microsoft.VisualStudio.Workload.NativeDesktop` and keep the two `Component.*` lines (~3 GB). With the workload it is ~6–7 GB. Expect 15–30 min depending on bandwidth.

   Alternative if you prefer a separate Build Tools install rather than touching Community:
   `winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --passive --norestart"` (the 2022 Build Tools toolset links Rust fine; check `winget search "Visual Studio" BuildTools` for a 2026 id first).

   Verify (new shell):
   ```powershell
   & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -all -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
   Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\Lib"   # must list a 10.0.26100.x folder
   ```

2. **rustup** (minimal profile, stable, MSVC host):

   ```powershell
   winget install Rustlang.Rustup
   # or: Invoke-WebRequest https://win.rustup.rs/x86_64 -OutFile $env:TEMP\rustup-init.exe
   #     & $env:TEMP\rustup-init.exe -y --profile minimal --default-toolchain stable --default-host x86_64-pc-windows-msvc
   ```
   ~2–5 min. Open a new terminal, then `cargo --version` and `rustc --version`.

3. **Smoke test the linker** before scaffolding:
   ```powershell
   cargo new $env:TEMP\linkcheck; Set-Location $env:TEMP\linkcheck; cargo run
   ```
   If this prints "Hello, world!" the MSVC + SDK setup is complete.

Tauri v2 has no other Windows prerequisites (WebView2 is present). Total estimated time: 25–45 min, mostly unattended downloads.

### 5.2 Scaffold (do not run yet – for reference)

```powershell
Set-Location C:\Users\Gerrit\gitfork
pnpm create tauri-app@latest LoLDraftTool --template vanilla-ts --manager pnpm --yes
# alternatives: --template react-ts | svelte-ts | vue-ts
Set-Location LoLDraftTool
pnpm install
pnpm add -D vitest
# optional native dialog plugin (not needed if <input type="file"> is used):
# pnpm tauri add dialog
# pnpm tauri add fs
pnpm tauri dev
```

Note: the repo already exists with `docs/`; run `create-tauri-app` into a temp folder and move the generated files in, or run it in place with `.` as the name and accept the merge.

### 5.3 Directory layout

```
LoLDraftTool/
├─ docs/
│  └─ research/tech-stack.md
├─ public/
│  ├─ champions/               # 170 square images, e.g. Aatrox.png (or .webp)
│  └─ champions.json           # [{ id, name, roles, tags... }]
├─ src/
│  ├─ engine/                  # pure TS, no DOM, no Tauri imports
│  │  ├─ recommend.ts
│  │  ├─ import.ts             # JSON/CSV parsing + validation
│  │  └─ *.test.ts             # Vitest
│  ├─ platform/
│  │  └─ index.ts              # pickAndReadTextFile() – the ONLY place touching shell APIs
│  ├─ ui/                      # champion grid, team columns, ban rows, center panel
│  ├─ main.ts
│  └─ styles.css
├─ src-tauri/
│  ├─ src/main.rs, lib.rs      # generated; untouched
│  ├─ icons/
│  ├─ capabilities/default.json
│  ├─ tauri.conf.json
│  └─ Cargo.toml
├─ index.html
├─ package.json
├─ vite.config.ts
└─ vitest.config.ts (or the `test` block inside vite.config.ts)
```

### 5.4 Bundling the champion images

- Put them in `public/champions/<ChampionId>.png` and reference by data (`/champions/${c.id}.png`). Vite copies `public/` verbatim into `dist/`; Tauri embeds everything in `dist/` into the exe at build time (`"frontendDist": "../dist"` in `tauri.conf.json`). No fs permission or asset protocol is needed for embedded assets.
- Size budget: 170 × 120×120 PNG ≈ 3–5 MB; converting to WebP (`cwebp -q 85`) roughly halves that. Both formats render in WebView2.
- If you prefer hashed, tree-shaken imports: `import.meta.glob('./assets/champions/*.png', { eager: true, query: '?url', import: 'default' })`. Not needed here; the `public/` approach is simpler and data-driven.

### 5.5 File-open dialogs (JSON/CSV import)

Option A (recommended, zero plugins, works in Tauri *and* the WPF fallback):

```ts
// src/platform/index.ts
export function pickAndReadTextFile(accept = '.json,.csv'): Promise<{ name: string; text: string } | null> {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}
```
WebView2 opens the native Windows dialog for `<input type="file">`.

Option B (native Tauri dialog, if you want default directories / multi-select):
```powershell
pnpm tauri add dialog
pnpm tauri add fs
```
```ts
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
const path = await open({ multiple: false, filters: [{ name: 'Draft data', extensions: ['json', 'csv'] }] });
if (path) text = await readTextFile(path as string);
```
Add `"dialog:default"` and `"fs:default"` (or a scoped `fs:allow-read-text-file`) to `src-tauri/capabilities/default.json`.

### 5.6 Build a portable exe and an installer

`src-tauri/tauri.conf.json` (relevant bits):
```json
{
  "productName": "LoLDraftTool",
  "identifier": "ag.dvs.loldrafttool",
  "build": { "beforeBuildCommand": "pnpm build", "frontendDist": "../dist", "devUrl": "http://localhost:5173", "beforeDevCommand": "pnpm dev" },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "windows": { "webviewInstallMode": { "type": "downloadBootstrapper" }, "nsis": { "installMode": "currentUser" } }
  }
}
```
- `webviewInstallMode` only matters on machines *without* WebView2; `downloadBootstrapper` keeps the installer small. Use `"type": "skip"` for a strictly-offline installer (Win 11 always has WebView2), or `"embedBootstrapper"` (+~2 MB) for safety.
- Build: `pnpm tauri build`
  - Portable exe: `src-tauri\target\release\LoLDraftTool.exe` (frontend embedded; only needs WebView2 on the target).
  - Installer: `src-tauri\target\release\bundle\nsis\LoLDraftTool_<version>_x64-setup.exe`.
- Optional size trim in `src-tauri/Cargo.toml`:
  ```toml
  [profile.release]
  codegen-units = 1
  lto = true
  opt-level = "s"
  panic = "abort"
  strip = true
  ```

### 5.7 Unit tests for the engine (Vitest)

```ts
// vite.config.ts
import { defineConfig } from 'vite';
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  test: { include: ['src/engine/**/*.test.ts'], environment: 'node' },
});
```
`package.json` scripts:
```json
{ "test": "vitest run", "test:watch": "vitest", "typecheck": "tsc --noEmit" }
```
Run: `pnpm test`. Keep `src/engine` free of DOM and Tauri imports so tests run in plain Node with no mocks.

### 5.8 CI-free local build commands

```powershell
pnpm install            # once
pnpm test               # engine unit tests
pnpm typecheck
pnpm tauri dev          # HMR dev window
pnpm tauri build        # release exe + NSIS installer
```

---

## 6. Fallback plan: .NET 10 WPF + WebView2 host (if MSVC cannot be installed)

Zero new installs. Same `dist/` from Vite.

```powershell
Set-Location C:\Users\Gerrit\gitfork\LoLDraftTool
dotnet new wpf -n LoLDraftTool.Host -o host --framework net10.0-windows
dotnet add host package Microsoft.Web.WebView2
```

`host/MainWindow.xaml.cs` essentials (~40 lines):
```csharp
await Web.EnsureCoreWebView2Async();
var root = Path.Combine(AppContext.BaseDirectory, "wwwroot");
Web.CoreWebView2.SetVirtualHostNameToFolderMapping("app", root, CoreWebView2HostResourceAccessKind.Allow);
Web.Source = new Uri(Debugger.IsAttached ? "http://localhost:5173" : "https://app/index.html");
```
`host/LoLDraftTool.Host.csproj` additions:
```xml
<ItemGroup>
  <Content Include="..\dist\**" Link="wwwroot\%(RecursiveDir)%(Filename)%(Extension)" CopyToOutputDirectory="PreserveNewest" />
</ItemGroup>
```
Build:
```powershell
pnpm build
dotnet publish host -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true
# → host\bin\Release\net10.0-windows\win-x64\publish\LoLDraftTool.Host.exe  (~45–70 MB) + wwwroot\
```
Framework-dependent variant (`--self-contained false`) is ~3 MB but requires the .NET 10 Desktop Runtime on the target machine. For an installer, Inno Setup (`winget install JRSoftware.InnoSetup`) is the simplest single-script option.

File import in the fallback: the same `<input type="file">` code path works unchanged; no host object bridge required.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| MSVC workload install fails or conflicts with the half-installed Insiders VC toolset | blocks Tauri | Install into the Community instance (section 5.1) or a separate Build Tools instance; verify with `cargo run` smoke test; otherwise use section 6 |
| First `cargo build` slow (3–6 min) | annoyance | one-time; incremental builds are fast; frontend HMR does not rebuild Rust |
| WebView2 missing on a target machine | app does not start | Win 11 always ships it; NSIS `downloadBootstrapper`/`embedBootstrapper` covers Win 10 |
| VS Community license shows `expirationDate 2026-09-23` | VS IDE may ask to sign in | irrelevant for command-line MSVC/`link.exe`; Build Tools alternative avoids it entirely |
| Champion image licensing (Riot assets) | distribution | Riot's Legal Jibber Jabber permits non-commercial fan use; keep the tool non-commercial and attribute |
