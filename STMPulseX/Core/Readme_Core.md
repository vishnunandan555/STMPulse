# 🧠 Core Application & Driver Architecture (`Core/`)

[![Component](https://img.shields.io/badge/Module-STM32WB55%20Core-blue.svg)]()
[![Version](https://img.shields.io/badge/Version-v0.1.1--Pre--BLE-blue.svg)]()
[![Language](https://img.shields.io/badge/Language-C99-brightgreen.svg)]()
[![Interface](https://img.shields.io/badge/I2C-100%20kHz%20Standard-orange.svg)]()

This document provides a detailed walkthrough of the core firmware logic located in [`STMPulseX/Core`](file:///c:/Users/vishn/Projects/STM/STMPulseX/Core), including peripheral initialization, sensor driver routines, register configurations, and formatting pipelines.

---

## 📂 Source Code Layout

| File | Purpose |
|:---|:---|
| [`Core/Src/main.c`](Src/main.c) | Main entry point, 25 Hz cooperative scheduler, MAX30102 driver, BME280 driver, and telemetry formatter |
| [`Core/Inc/main.h`](Inc/main.h) | Global header, error handler prototypes, pin defines, HAL includes |
| [`Core/Src/stm32wbxx_hal_msp.c`](Src/stm32wbxx_hal_msp.c) | MSP hardware initialization (GPIO clocks, I2C1 pin mappings `PB6`/`PB7`, USB power rail `HAL_PWREx_EnableVddUSB()`) |
| [`Core/Src/stm32wbxx_it.c`](Src/stm32wbxx_it.c) | Interrupt service routines (SysTick, USB High/Low Priority interrupts) |
| [`Core/Startup/startup_stm32wb55cgux.s`](Startup/startup_stm32wb55cgux.s) | Vector table, reset sequence, and C-runtime initialization |

---

## 🩺 MAX30102 Optical Sensor Driver

The **MAX30102** is interfaced over hardware I2C1 at 7-bit address `0x57` (`0xAE` write, `0xAF` read).

### Register Map & Settings

| Register | Name | Configured Value | Description |
|:---|:---|:---|:---|
| `0x09` | `MODE_CONFIG` | `0x03` | SpO2 Mode (Dual LED: Red + Infrared) |
| `0x08` | `FIFO_CONFIG` | `0x40` | Sample averaging: 4x, FIFO rollover enabled |
| `0x0A` | `SPO2_CONFIG` | `0x27` | ADC full scale 4096 nA, 100 SPS, 411 µs pulse width (18-bit resolution) |
| `0x0C` | `LED1_PA` | `0x24` | Red LED Current: ~7.2 mA |
| `0x0D` | `LED2_PA` | `0x24` | Infrared LED Current: ~7.2 mA |
| `0x21` | `TEMP_CONFIG` | `0x01` | Initiates non-blocking on-die temperature measurement |
| `0x1F` | `TEMP_INT` | Read-only | Integer part of die temperature ($^\circ\text{C}$) |
| `0x20` | `TEMP_FRAC` | Read-only | Fractional part of die temperature ($1/16^\circ\text{C}$ steps) |

### Non-Blocking Temperature Acquisition
```c
// Phase 2: Trigger conversion (takes ~29 ms internally)
static void max30102_trigger_temp(void) {
    uint8_t val = 0x01;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, 0x21, 1, &val, 1, 100);
}

// Phase 3: Harvest result 40 ms later without bus blocking
static float max30102_get_temp(void) {
    int8_t tint = 0;
    uint8_t tfrac = 0;
    HAL_I2C_Mem_Read(&hi2c1, MAX30102_ADDR, 0x1F, 1, (uint8_t*)&tint, 1, 100);
    HAL_I2C_Mem_Read(&hi2c1, MAX30102_ADDR, 0x20, 1, &tfrac, 1, 100);
    return (float)tint + ((float)tfrac * 0.0625f);
}
```

---

## 🌡️ BME280 Environmental Sensor Driver

The **BME280** is configured at I2C address `0x76` (`0xEC` write, `0xED` read).

### Trimming Parameters & Compensation
Upon initialization, 26 bytes of non-volatile factory calibration constants (`T1-T3`, `P1-P9`, `H1-H6`) are read from registers `0x88-0xA1` and `0xE1-0xE7`.

```c
typedef struct {
    uint16_t T1;
    int16_t  T2, T3;
    uint16_t P1;
    int16_t  P2, P3, P4, P5, P6, P7, P8, P9;
    uint8_t  H1, H3;
    int16_t  H2;
    int16_t  H4, H5;
    int8_t   H6;
} BME280_Calibration;
```

### Burst Readout
During execution Phase 1 (every 1 second), an 8-byte burst transaction reads registers `0xF7` through `0xFE`:
- Bytes 0–2: Pressure ADC raw counts (20-bit)
- Bytes 3–5: Temperature ADC raw counts (20-bit)
- Bytes 6–7: Humidity ADC raw counts (16-bit)

These raw counts pass through Bosch's integer/floating-point formulas to compute precise ambient temperature ($^\circ\text{C}$), barometric pressure ($\text{hPa}$), and relative humidity ($\%RH$).

---

## ⚡ Lightweight Telemetry Formatting (No Float Printf Bloat)

Standard GCC `newlib-nano` `printf` with floating point support (`-u _printf_float`) increases Flash footprint by ~12 KB and adds significant stack overhead.

`STMPulseX` implements fixed-point decimal splitting using standard integer arithmetic:

```c
long t_c100  = (long)(s_temp * 100.0f);
long h_pct100= (long)(s_hum * 100.0f);
long p_hpa100= (long)(s_press);
long ct_c100 = (long)(s_ctemp * 100.0f);

long t_frac = t_c100 % 100;
if (t_frac < 0) t_frac = -t_frac;

usb_log("[#%lu] ENV: %ld.%02ld C, %ld.%02ld %%, %ld.%02ld hPa | PULSE: Finger=%s (RED=%lu, IR=%lu, CTEMP=%ld.%02ld C)\r\n",
        sample_count,
        t_c100 / 100, t_frac,
        h_pct100 / 100, h_pct100 % 100,
        p_hpa100 / 100, p_hpa100 % 100,
        finger_detected ? "YES" : "NO ",
        red_val, ir_val,
        ct_c100 / 100, ct_frac);
```

This reduces code size, eliminates dynamic heap usage, and ensures deterministic execution timing.
