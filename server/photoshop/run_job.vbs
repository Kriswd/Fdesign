Option Explicit
On Error Resume Next

Dim args
Set args = WScript.Arguments

If args.Count < 2 Then
  WScript.Echo "usage: cscript //Nologo run_job.vbs <script.jsx> <job.json> [attachOnly|bringToFront] [bringToFront]"
  WScript.Quit 2
End If

Dim jsxPath
Dim jobPath
jsxPath = args.Item(0)
jobPath = args.Item(1)

Dim attachOnly
attachOnly = False
If args.Count >= 3 Then
  Dim flag
  flag = LCase(CStr(args.Item(2)))
  If flag = "1" Or flag = "true" Or flag = "attachonly" Then
    attachOnly = True
  End If
End If

Dim bringToFront
bringToFront = False
If args.Count >= 3 Then
  Dim flag2
  flag2 = LCase(CStr(args.Item(2)))
  If flag2 = "bringtofront" Or flag2 = "bring" Then
    bringToFront = True
  End If
End If
If args.Count >= 4 Then
  Dim flag3
  flag3 = LCase(CStr(args.Item(3)))
  If flag3 = "1" Or flag3 = "true" Or flag3 = "bringtofront" Or flag3 = "bring" Then
    bringToFront = True
  End If
End If

Dim appRef
Err.Clear
Set appRef = GetObject(, "Photoshop.Application")
If Err.Number <> 0 Then
  If attachOnly Then
    WScript.Quit 0
  End If
  Err.Clear
  Set appRef = CreateObject("Photoshop.Application")
End If
If Err.Number <> 0 Then
  WScript.Echo "failed_to_create_photoshop_application"
  WScript.Quit 3
End If

If bringToFront Then
  appRef.BringToFront
End If
Err.Clear
Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

Dim execScriptPath
execScriptPath = jsxPath
Dim hasInjectedJobPath
hasInjectedJobPath = False

Dim vbsLogPath
vbsLogPath = jobPath & ".vbs.log"
On Error Resume Next
Dim logFile
Set logFile = fso.CreateTextFile(vbsLogPath, True, True)
If Err.Number = 0 Then
  logFile.WriteLine "time=" & Now
  logFile.WriteLine "jsxPath=" & jsxPath
  logFile.WriteLine "jobPath=" & jobPath
  logFile.WriteLine "execScriptPath=" & execScriptPath
  Err.Clear
  If fso.FileExists(execScriptPath) Then
    Dim f
    Set f = fso.GetFile(execScriptPath)
    logFile.WriteLine "jsxSize=" & CStr(f.Size)
  Else
    logFile.WriteLine "jsxSize=missing"
  End If
  Err.Clear
  Dim ts
  Set ts = fso.OpenTextFile(execScriptPath, 1, False, 0)
  If Err.Number = 0 Then
    Dim head
    head = ""
    On Error Resume Next
    head = ts.Read(8192)
    On Error GoTo 0
    ts.Close
    If InStr(1, head, "__FDESIGN_JOB_PATH", vbTextCompare) > 0 Then
      hasInjectedJobPath = True
    End If
    Dim pos
    pos = InStr(1, head, "SCRIPT_BUILD", vbTextCompare)
    If pos > 0 Then
      Dim startPos
      startPos = InStrRev(head, vbCrLf, pos)
      If startPos <= 0 Then startPos = InStrRev(head, vbLf, pos)
      If startPos <= 0 Then
        startPos = 1
      Else
        startPos = startPos + 1
      End If
      Dim endPos
      endPos = InStr(pos, head, vbCrLf)
      If endPos <= 0 Then endPos = InStr(pos, head, vbLf)
      If endPos <= 0 Then endPos = Len(head) + 1
      logFile.WriteLine "scriptBuildLine=" & Replace(Mid(head, startPos, endPos - startPos), vbTab, " ")
    Else
      logFile.WriteLine "scriptBuildLine=not_found"
    End If
  Else
    Err.Clear
    logFile.WriteLine "scriptBuildLine=read_failed"
  End If
  If hasInjectedJobPath Then
    logFile.WriteLine "invokeMode=direct_with_injected_job_path"
  Else
    logFile.WriteLine "invokeMode=direct_with_argument"
  End If
  logFile.Close
End If
On Error GoTo 0

Err.Clear
If hasInjectedJobPath Then
  Call appRef.DoJavaScriptFile(execScriptPath, Array(), 1)
Else
  Call appRef.DoJavaScriptFile(execScriptPath, Array(jobPath), 1)
End If
On Error GoTo 0
If Err.Number <> 0 Then
  WScript.Echo "failed_to_run_script:" & Err.Description
  WScript.Quit 4
End If

WScript.Quit 0
