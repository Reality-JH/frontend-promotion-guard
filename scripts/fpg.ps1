param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)
$ErrorActionPreference = "Stop"
& node (Join-Path $PSScriptRoot "../dist/cli.js") @Arguments
exit $LASTEXITCODE
