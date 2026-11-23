#ifndef AppVersion
#define AppVersion "0.12.16"
#endif

[Setup]
AppId={{8CB3D871-4B78-48B2-A4DF-71D54BB67A31}
AppName=Poknapham Editing Suite
AppVersion={#AppVersion}
AppPublisher=Poknapham
DefaultDirName={localappdata}\Programs\Poknapham Editing Suite
DefaultGroupName=Poknapham Editing Suite
PrivilegesRequired=lowest
OutputDir=installer
OutputBaseFilename=PoknaphamEditingSuite-Setup-v{#AppVersion}
Compression=lzma
SolidCompression=yes
UninstallDisplayIcon={app}\PoknaphamEditingSuite.exe

[Files]
Source: "dist\PoknaphamEditingSuite\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Poknapham Editing Suite"; Filename: "{app}\PoknaphamEditingSuite.exe"
Name: "{autodesktop}\Poknapham Editing Suite"; Filename: "{app}\PoknaphamEditingSuite.exe"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked

[Run]
Filename: "{app}\PoknaphamEditingSuite.exe"; Description: "Open Poknapham Editing Suite"; Flags: nowait postinstall skipifsilent
