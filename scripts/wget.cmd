@echo off
REM --- Simple wget wrapper using curl ---

setlocal

set QUIET=
set OUTPUT=
set URL=

:parse
if "%~1"=="" goto done
if "%~1"=="-q" (
  set QUIET=-s
) else if "%~1"=="--show-progress" (
  REM curl shows progress by default unless -s is set
) else if "%~1"=="-N" (
  REM ignore, wget -N is about timestamping
) else if "%~1"=="-O" (
  shift
  set OUTPUT=-o %~1
) else (
  set URL=%~1
)
shift
goto parse

:done
if "%URL%"=="" (
  echo ERROR: No URL provided
  exit /b 1
)

curl --retry 5 --retry-delay 5 --retry-connrefused %QUIET% -L %OUTPUT% %URL%

endlocal
