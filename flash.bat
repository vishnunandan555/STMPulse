@echo off
"C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe" -c port=usb1 -w "c:\Users\vishn\Projects\STM\STMPulseX\Debug\STMPulseX.elf" 0x08000000 -v -rst

