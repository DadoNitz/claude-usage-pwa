<#
  Instala o Claude Usage Sync como tarefa agendada do Windows: roda
  sync-daemon.js a cada 5 minutos, sozinho, sem precisar abrir navegador.

  Uso:
    .\install-windows-task.ps1 -Code SEUCODIGODESINCRONIZACAO

  Rode isso em cada um dos seus computadores (com o MESMO código), uma vez.
#>
param(
  [Parameter(Mandatory=$true)][string]$Code
)
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$daemonPath = Join-Path $scriptDir 'sync-daemon.js'
if (-not (Test-Path $daemonPath)) { throw "Não achei sync-daemon.js em $scriptDir" }

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw "Node.js não encontrado no PATH. Instale em https://nodejs.org (versão 18 ou mais nova) e tente de novo." }
$nodePath = $nodeCmd.Source

Write-Host "Rodando uma vez pra salvar o código e confirmar que está tudo certo..."
& $nodePath $daemonPath $Code
if ($LASTEXITCODE -ne 0) { throw "A primeira execução falhou — confira a mensagem acima antes de continuar." }

$taskName = "ClaudeUsageSync"
$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$daemonPath`"" -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host ""
Write-Host "Pronto! Tarefa '$taskName' criada — roda a cada 5 minutos, mesmo sem o navegador aberto."
Write-Host "Pra conferir: abra o 'Agendador de Tarefas' do Windows e procure por '$taskName'."
Write-Host "Pra remover depois: .\uninstall-windows-task.ps1"
