' wget.vbs  — VBScript wrapper that emulates parts of wget using curl
'   - parses: -q, --show-progress, -N, -O <outfile>, URL
'   - ensures output folder exists
'   - emulates wget -N (if file exists) using curl -z "<outfile>"
'   - calls: curl -L --fail --retry 5 --retry-delay 5 --retry-connrefused --output "<outfile>" [ -z "<outfile>" ] "<url>"
'   - prints the command then runs it; exits with curl's exit code

Option Explicit

Dim sh : Set sh  = CreateObject("WScript.Shell")
Dim fso: Set fso = CreateObject("Scripting.FileSystemObject")

Dim QUIET : QUIET = ""          ' (your batch ignores -q and --show-progress; we keep that behavior)
Dim OUTFILE : OUTFILE = ""
Dim URL : URL = ""
Dim USE_TIME_COND : USE_TIME_COND = False
Dim CURL_TIME_COND : CURL_TIME_COND = ""

' ---- parse args ----
Dim i, a
i = 0
Do While i < WScript.Arguments.Count
  a = WScript.Arguments(i)

  ' match your diagnostic echo:
  WScript.Echo Chr(34) & "Testigng " & a & Chr(34)

  If a = "-q" Then
    ' curl shows progress unless -s; you commented out mapping; keep same behavior
    i = i + 1

  ElseIf a = "--show-progress" Then
    ' curl default shows progress; nothing to do
    i = i + 1

  ElseIf a = "-N" Then
    ' emulate later once we know OUTFILE
    USE_TIME_COND = True
    i = i + 1

  ElseIf a = "-O" Then
    If i + 1 >= WScript.Arguments.Count Then
      WScript.Echo "Missing -O argument for output file"
      WScript.Quit 1
    End If
    OUTFILE = WScript.Arguments(i + 1)
    i = i + 2

  Else
    ' treat first non-option as URL (last one wins if multiple provided, matching your batch flow)
    URL = a
    i = i + 1
  End If
Loop

' ---- validate ----
If OUTFILE = "" Then
  WScript.Echo "Missing -O argument for output file"
  WScript.Quit 1
End If
If URL = "" Then
  WScript.Echo "Missing URL"
  WScript.Quit 1
End If

' ---- ensure output directory exists (wget creates intermediate dirs for -O paths) ----
Dim outDir : outDir = fso.GetParentFolderName(OUTFILE)
If outDir <> "" Then EnsureFolderTree outDir

' ---- emulate wget -N: if requested and file exists, pass curl -z "<outfile>" ----
If USE_TIME_COND And fso.FileExists(OUTFILE) Then
  ' Note: your batch sets:   set "CURL_TIME_COND=-z "%OUTFILE%""
  ' We replicate that exact shape (quoted path, no @ prefix), to match your wrapper’s behavior.
  CURL_TIME_COND = " -z " & Q(OUTFILE)
End If

' ---- build and run curl ----
Dim cmd
cmd = "curl -L" & _
      " --fail --retry 5 --retry-delay 5 --retry-connrefused" & _
      " --output " & Q(OUTFILE) & _
      CURL_TIME_COND & _
      " " & Q(URL)

' Show the command like your batch does:
WScript.Echo cmd

' Run in-shell so progress UI appears in the console. Requires cscript host for clean console output.
Dim rc
rc = sh.Run("cmd /c " & cmd, 1, True)

WScript.Echo Chr(34) & "Finished with errorlevel " & rc & Chr(34))
WScript.Quit rc

' ---------- helpers ----------
Function Q(s)
  Q = """" & Replace(s, """", """""") & """"
End Function

Sub EnsureFolderTree(p)
  If p = "" Then Exit Sub
  If fso.FolderExists(p) Then Exit Sub
  Dim parent : parent = fso.GetParentFolderName(p)
  If parent <> "" Then EnsureFolderTree parent
  On Error Resume Next
  fso.CreateFolder p
  On Error GoTo 0
End Sub
