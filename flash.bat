@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo   STMPulseX USB DFU Programmer
echo ==========================================================
echo.
echo Searching for STM32 in USB DFU mode (port=usb1)...
echo.

"C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe" -c port=usb1 -w "STMPulseX\Debug\STMPulseX.elf" 0x08000000 -v -rst
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================================
    echo   FLASH SUCCESSFUL! STM32 running in USB CDC mode (COM3).
    echo ==========================================================
    timeout /t 3 >nul
    exit /b 0
)

echo.
echo ----------------------------------------------------------
echo   [!] STM32 was not detected in DFU mode.
echo ----------------------------------------------------------
echo   How to enter DFU mode via buttons:
echo     1. Keep the USB-C cable plugged into your PC.
echo     2. Press and HOLD the BOOT0 button.
echo     3. While still holding BOOT0, press and release NRST (Reset) once.
echo     4. Wait 1 second, then RELEASE the BOOT0 button.
echo        (You will hear a Windows USB disconnect/connect chime)
echo.
echo   * Note: STM32 DFU is a specialized flashing protocol,
echo     it will NOT show up as a USB flash drive/pendrive.
echo ----------------------------------------------------------
echo.
pause
echo Retrying DFU flash...
"C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe" -c port=usb1 -w "STMPulseX\Debug\STMPulseX.elf" 0x08000000 -v -rst
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================================
    echo   FLASH SUCCESSFUL! STM32 running in USB CDC mode (COM3).
    echo ==========================================================
)
pause
