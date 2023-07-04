(Get-Content dist/extension.cjs) -replace "require\('vscode-windows-registry'\)", "require('../vendor/vscode-windows-registry')" | Set-Content dist/extension.cjs
