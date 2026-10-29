# ⚙️ STMPulseX Firmware Engineering Guide

[![Target MCU](https://img.shields.io/badge/Target-STM32WB55CGUx-03234b.svg?logo=stmicroelectronics)](https://www.st.com/en/microcontrollers-microprocessors/stm32wb55cg.html)
[![IDE](https://img.shields.io/badge/IDE-STM32CubeIDE-blue.svg)](https://www.st.com/en/development-tools/stm32cubeide.html)
[![Toolchain](https://img.shields.io/badge/Toolchain-GNU%20Arm%20Embedded-brightgreen.svg)](https://developer.arm.com/downloads/-/gnu-arm-embedded-toolchain-downloads)
[![HAL](https://img.shields.io/badge/HAL-STM32Cube%20WB%20v1.17+-orange.svg)]()

This guide covers the firmware architecture, build system, clock configuration, linker memory mappings, and flashing procedures for the **STMPulseX** embedded software.

---

## 🏗 Directory Organization

```
STMPulseX/
├── Core/                      # Application sources, entry point, interrupts & clock setup
│   ├── Inc/                   # main.h, stm32wbxx_hal_conf.h, stm32wbxx_it.h
│   ├── Src/                   # main.c, stm32wbxx_hal_msp.c, stm32wbxx_it.c, syscalls.c
│   └── Startup/               # startup_stm32wb55cgux.s (vector table & reset handler)
├── Drivers/                   # CMSIS standard and STM32WBxx HAL library drivers
│   ├── CMSIS/                 # Cortex-M4 / Cortex-M0+ core definitions
│   └── STM32WBxx_HAL_Driver/  # Peripherals drivers (I2C, RCC, GPIO, PWR, USB)
├── Middlewares/               # ST USB Device CDC Class Library
│   └── ST/STM32_USB_Device_Library/
├── USB_Device/                # Application USB CDC descriptor and interface implementation
│   ├── App/                   # usb_device.c, usbd_cdc_if.c, usbd_desc.c
│   └── Target/                # usbd_conf.c (PCD hardware glue layer)
├── STM32WB55CGUX_FLASH.ld     # Flash linker script (1024 KB Flash, 256 KB SRAM)
├── STM32WB55CGUX_RAM.ld       # RAM execution linker script
├── STMPulseX.ioc              # STM32CubeMX graphical configuration model
└── Readme_Firmware.md         # This technical reference
```

---

## ⚡ Target Microcontroller Specifications

* **Device**: STM32WB55CGUx (UFQFPN48 package)
* **Application Core**: ARM 32-bit Cortex-M4 with FPU & MPU, up to 64 MHz
* **Co-processor**: ARM 32-bit Cortex-M0+ dedicated to 2.4 GHz RF (BLE 5.4, 802.15.4)
* **Embedded Memories**:
  * Flash: 1,024 KB dual-bank with ECC
  * SRAM1: 192 KB
  * SRAM2a / SRAM2b: 64 KB with parity retention
* **Peripherals Active in STMPulseX**:
  * **I2C1**: Fast-mode communication with MAX30102 and BME280 (`PB6` / `PB7`)
  * **USB 2.0 Full-Speed**: Device controller running Virtual COM Port (`PA11` / `PA12`)
  * **SMPS**: Internal step-down regulator enabled for maximum electrical efficiency

---

## ⏱ Clock Configuration

The microcontroller clock tree is initialized in `SystemClock_Config()` ([`Core/Src/main.c`](Core/Src/main.c)):

```
  ┌──────────────┐
  │   MSI Clock  │
  │   (4 MHz)    │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐      PLLM = 1, PLLN = 32
  │   Main PLL   ├──────────────────────────────► SYSCLK = 64 MHz
  └──────┬───────┘      PLLR = 2                  │
         │                                        ├──► HCLK1 (Cortex-M4): 64 MHz
         │                                        ├──► HCLK2 (Cortex-M0+): 32 MHz
         │                                        ├──► HCLK4 (Shared): 64 MHz
         │                                        ├──► PCLK1 (I2C1): 64 MHz
         │                                        └──► PCLK2: 64 MHz
         │
         ▼              PLLQ = 2
    48 MHz Clock ───────────────────────────────► USB Device Controller (48 MHz)
```

1. **MSI (Multispeed Internal RC Oscillator)** is configured at 4 MHz as the main PLL source.
2. **MSI Auto-Calibration** is enabled via LSE or hardware trim (`HAL_RCCEx_EnableMSIPLLMode()`).
3. **Phase-Locked Loop (PLL)**:
   - Input: $4\text{ MHz} / 1 = 4\text{ MHz}$
   - Multiplication Factor: $\times 32 = 128\text{ MHz}$ (VCO output)
   - Divider $R = 2 \implies 64\text{ MHz}$ system core clock.
   - Divider $Q = 2 \implies 48\text{ MHz}$ dedicated USB full-speed peripheral clock.
4. **Internal Step-Down Regulator (SMPS)** is energized from HSI to minimize current draw.

---

## 🔁 Cooperative 25 Hz Execution Loop

Rather than relying on preemptive RTOS tasks for simple telemetry streams, `STMPulseX` utilizes a lightweight cooperative phase scheduler inside `main()`:

```c
uint32_t phase = sample_count % 25;

if (phase == 1) {
    // Read 8 bytes of burst environmental data from BME280 (1 Hz)
    bme280_read_raw(bme_data);
} else if (phase == 2) {
    // Non-blocking trigger of MAX30102 on-die temperature
    max30102_trigger_temp();
} else if (phase == 3) {
    // Harvest converted MAX30102 temperature (took ~29 ms)
    s_ctemp = max30102_get_temp();
}

// Continuous 25 Hz execution:
max30102_read_fifo(&red_val, &ir_val);
usb_log("[#%lu] ENV: ... | PULSE: ...\r\n", sample_count, ...);
HAL_Delay(40); // 40 ms interval = 25 Hz
```

### Why Phase Interleaving?
The MAX30102 die temperature conversion takes ~29 ms. By issuing the trigger command in `phase == 2` and harvesting the registers in `phase == 3` (40 ms later), the firmware achieves zero blocking wait loops on the I2C bus.

---

## 🛠 Compilation & Build Instructions

### Prerequisites
* **STM32CubeIDE** (Version 1.14.0 or newer)
* **GNU Arm Embedded Toolchain** (`arm-none-eabi-gcc` 12.3.rel1 or compatible)

### Steps to Build
1. Launch STM32CubeIDE.
2. Select **File > Import > Existing Projects into Workspace**.
3. Set the root directory to `c:\Users\vishn\Projects\STM\STMPulseX`.
4. Ensure `STMPulseX` is checked and click **Finish**.
5. Select active build configuration:
   - **Debug**: Optimization `-O0` or `-Og`, full debugging symbols.
   - **Release**: Optimization `-O2` or `-Os`, minimal binary size.
6. Click **Project > Build All** (`Ctrl + B`).
7. The compiled ELF and binary files will be produced in `Debug/STMPulseX.elf` or `Release/STMPulseX.elf`.

---

## ⚡ Flashing & Debugging

### Option A: ST-LINK V2 / V3 (Recommended)
1. Attach your SWD programmer:
   - `SWCLK` -> PA14
   - `SWDIO` -> PA13
   - `GND`   -> GND
   - `3V3`   -> VDD Target
2. In STM32CubeIDE, click **Run > Debug Configurations...**.
3. Select `STMPulseX Debug`, set Debug probe to **ST-LINK (OpenOCD or ST-LINK GDB server)**.
4. Click **Debug** (`F11`).

### Option B: STM32CubeProgrammer CLI
```bash
STM32_Programmer_CLI -c port=SWD mode=UR -w Debug/STMPulseX.elf -v -s
```

---

## 🤝 Collaborator Notes
- **Do Not Manually Overwrite Generated Code Blocks**: STM32CubeMX markers (`/* USER CODE BEGIN ... */` and `/* USER CODE END ... */`) must be respected when editing files so that subsequent regeneration from `STMPulseX.ioc` preserves manual logic.
- **Linker RAM Layout**: Note that Cortex-M0+ firmware or BLE stacks (when enabled) allocate from SRAM2a and SRAM2b. Core application RAM must remain bound to SRAM1.
