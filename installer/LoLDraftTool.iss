; Inno Setup script for LoLDraftTool.
;
; Compile with:
;   ISCC.exe /DMyAppVersion=1.2.3 /Odist-release installer\LoLDraftTool.iss
;
; Expects the self-contained single-file publish output to exist at
; MySourceDir (the default matches `pnpm host:publish`). Produces
;   LoLDraftTool-<version>-win-x64-setup.exe

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef MySourceDir
  #define MySourceDir "..\host\bin\Release\net10.0-windows\win-x64\publish"
#endif

#define MyAppName "LoLDraftTool"
#define MyAppPublisher "IcaruzSoftware"
#define MyAppExeName "LoLDraftTool.exe"
#define MyAppUrl "https://github.com/IcaruzSoftware/LoLDraftTool"

[Setup]
AppId={{7E2C6B90-1D4E-4C3A-9E7A-3F5B9C2A8D11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppUrl}
AppSupportURL={#MyAppUrl}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Install per-user by default, but let the user elevate for an all-users install.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist-release
OutputBaseFilename=LoLDraftTool-{#MyAppVersion}-win-x64-setup
WizardStyle=modern
Compression=lzma2/ultra
SolidCompression=yes
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; The publish output ships LoLDraftTool.exe plus a loose wwwroot\ folder.
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Install the Evergreen WebView2 Runtime if it was downloaded because it is missing.
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime..."; Check: NeedsWebView2Install; Flags: waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  DownloadPage: TDownloadWizardPage;

// WebView2 Evergreen Runtime registers its version ("pv") under this GUID.
function WebView2Installed(): Boolean;
var
  pv: string;
begin
  Result :=
    (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', pv)
      and (pv <> '') and (pv <> '0.0.0.0'))
    or
    (RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', pv)
      and (pv <> '') and (pv <> '0.0.0.0'));
end;

// True only when the runtime is missing AND the bootstrapper was downloaded.
function NeedsWebView2Install(): Boolean;
begin
  Result := (not WebView2Installed()) and FileExists(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'));
end;

procedure InitializeWizard();
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), nil);
end;

// Before installing, fetch the Evergreen bootstrapper if the runtime is absent.
// A failed download is non-fatal: we tell the user where to get it manually.
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if WebView2Installed() then
    Exit;

  DownloadPage.Clear;
  DownloadPage.Add('https://go.microsoft.com/fwlink/p/?LinkId=2124703', 'MicrosoftEdgeWebview2Setup.exe', '');
  DownloadPage.Show;
  try
    try
      DownloadPage.Download;
    except
      MsgBox('LoLDraftTool needs the Microsoft Edge WebView2 Runtime, which could not be downloaded automatically.' + #13#10 +
             'Install it from https://developer.microsoft.com/microsoft-edge/webview2/ and then launch LoLDraftTool.',
             mbInformation, MB_OK);
    end;
  finally
    DownloadPage.Hide;
  end;
end;
