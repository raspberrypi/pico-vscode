@echo off
REM --- wget.cmd replacement wrapper for curl ---

setlocal

set "QUIET="
set "OUTFILE="
set "URL="

:parse
if "%~1"=="" goto run

echo "Testigng %~1"
if "%~1"=="-q" (
    REM set "QUIET=-s"
    shift & goto parse
) else if "%~1"=="--show-progress" (
    REM curl shows progress by default unless -s is used
    shift & goto parse
) else if "%~1"=="-N" (
    REM emulate wget -N via curl --time-cond later once we know OUTFILE
    REM set "USE_TIME_COND=1"
    shift & goto parse
) else if "%~1"=="-O" (
    set "OUTFILE=%~2"
    shift & shift & goto parse
) else (
    set "URL=%~1"
    shift & goto parse
)

:run
if "%OUTFILE%"=="" (
    echo Missing -O argument for output file
    endlocal & exit /b 1
)
if "%URL%"=="" (
    echo Missing URL
    endlocal & exit /b 1
)

REM Make sure output directory exists (wget creates intermediate dirs for -O paths)
for %%I in ("%OUTFILE%") do if not exist "%%~dpI" mkdir "%%~dpI" >nul 2>&1

REM Emulate wget -N: use local file mtime if file exists
if "%USE_TIME_COND%"=="1" (
    if exist "%OUTFILE%" (
        set "CURL_TIME_COND=-z "%OUTFILE%"
    )
)

REM Use --fail so HTTP 4xx/5xx return nonzero like wget
echo curl -L %QUIET% --fail --retry 5 --retry-delay 5 --retry-connrefused --output "%OUTFILE%" %CURL_TIME_COND% "%URL%"
curl -L %QUIET% --fail --retry 5 --retry-delay 5 --retry-connrefused --output "%OUTFILE%" %CURL_TIME_COND% "%URL%"
set "RC=%ERRORLEVEL%"
echo "Finished with errorlevel %ERRORLEVEL%"


endlocal & exit /b %RC%
