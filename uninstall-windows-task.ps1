<#
  Remove a tarefa agendada criada pelo install-windows-task.ps1.
  Não apaga sync-daemon.js nem os arquivos de config/estado em
  %USERPROFILE% — só desliga a execução automática.
#>
$taskName = "ClaudeUsageSync"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Tarefa '$taskName' removida."
} else {
  Write-Host "Nenhuma tarefa '$taskName' encontrada (já estava removida)."
}
