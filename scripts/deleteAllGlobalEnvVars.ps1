param (
    [Parameter(Mandatory=$true)]
    [string]$EnvVariablePrefix
)

Get-ChildItem "Env:$EnvVariablePrefix*" | ForEach-Object { [System.Environment]::SetEnvironmentVariable($_.Name, $null, [System.EnvironmentVariableTarget]::User) }
