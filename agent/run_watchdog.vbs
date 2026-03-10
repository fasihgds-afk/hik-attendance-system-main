' Run watchdog.bat hidden (no black command window)
' Must be in same folder as watchdog.bat

Set WshShell = CreateObject("WScript.Shell")
' Get directory where this VBS script lives
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\watchdog.bat"

' Run hidden: 0 = hide window, True = wait for exit (we don't wait - batch runs forever)
WshShell.Run """" & batPath & """", 0, False
