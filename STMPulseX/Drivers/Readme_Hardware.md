# 🔌 Hardware Integration & Driver Reference (`Drivers/`)

[![HAL Library](https://img.shields.io/badge/HAL-STM32WBxx%20v1.17+-blue.svg)]()
[![Version](https://img.shields.io/badge/Version-v0.1.1--Pre--BLE-blue.svg)]()
[![CMSIS](https://img.shields.io/badge/CMSIS-Core%20v5.6+-brightgreen.svg)](https://arm-software.github.io/CMSIS_5/)
[![Hardware](https://img.shields.io/badge/Bus-I2C%20Fast--Mode-orange.svg)]()

This guide covers the electrical specifications, sensor pinout, hardware decoupling requirements, and STM32WBxx HAL/CMSIS driver structure utilized in the **STMPulseX** platform.

---

## 📂 Driver Tree Structure

```
Drivers/
├── CMSIS/
│   ├── Device/ST/STM32WBxx/     # Register definitions, memory addresses, system startup headers
│   └── Include/                 # Cortex-M4 / Cortex-M0+ core access headers (core_cm4.h, mpu_armv7.h)
├── STM32WBxx_HAL_Driver/        # STMicroelectronics Hardware Abstraction Layer
│   ├── Inc/                     # Driver header files (stm32wbxx_hal_i2c.h, stm32wbxx_hal_rcc.h, etc.)
│   └── Src/                     # Driver source implementations
└── Readme_Hardware.md           # This hardware and driver specification
```

---

## ⚡ Electrical Schematic & Pinout

Both primary sensors share the hardware I2C1 peripheral on the STM32WB55CGUx:

```
                      +3.3V (Clean VDD Rail)
                        │
                  ┌─────┴─────┐
                 [4.7k]      [4.7k]  Pull-up Resistors
                  │           │
   STM32WB55      │           │          MAX30102 Sensor      BME280 Sensor
  ┌──────────┐    │           │         ┌───────────────┐    ┌───────────────┐
  │      PB6 ├────┼───────────┼─────────┤ SCL           │────┤ SCL           │
  │      PB7 ├────┼───────────┴─────────┤ SDA           │────┤ SDA           │
  │          │    │                     │               │    │               │
  │      VDD ├────┴─────────────────────┤ VIN / VDD     │────┤ VDD / VDDIO   │
  │      VSS ├──────────────────────────┤ GND           │────┤ GND / SDO (*) │
  │          │                          └───────────────┘    └───────────────┘
  │     PA11 ├──────── USB D- (Differential pair, 90 Ω)
  │     PA12 ├──────── USB D+ (Differential pair, 90 Ω)
  └──────────┘
```

> [!NOTE]
> (*) Tying `SDO` on the BME280 module to `GND` selects the primary I2C address `0x76`. If pulled high to `VDD`, the address becomes `0x77`.

---

## 🩺 MAX30102 Optical Sensor Specifications

The **MAX30102** is an integrated pulse oximetry and heart-rate monitor biosensor module.

| Parameter | Specification | Notes in STMPulseX |
|:---|:---|:---|
| **I2C 7-bit Address** | `0x57` (`0xAE` W / `0xAF` R) | Fixed hardware address |
| **Optical Emitters** | Dual LED: Red (660 nm) & Infrared (880 nm) | Optimized for oxygenated vs deoxygenated hemoglobin absorption |
| **ADC Resolution** | 18-bit dynamic range | Pulse width set to 411 µs for maximum SNR |
| **LED Current** | Programmable 0 to 50 mA | Configured to ~7.2 mA (`0x24`) to prevent tissue saturation |
| **On-Die Temperature** | Resolution: 0.0625 °C | Used for skin surface contact thermometry |
| **FIFO Buffer** | 32-sample depth | Sample averaging configured to 4x |

---

## 🌡️ BME280 Environmental Sensor Specifications

The **BME280** is a combined digital pressure, humidity, and temperature sensor.

| Parameter | Measurement Range | Accuracy | Notes in STMPulseX |
|:---|:---|:---|:---|
| **Temperature** | -40 to +85 °C | ±0.5 °C | 20-bit raw ADC, 1x oversampling |
| **Relative Humidity** | 0 to 100 %RH | ±3 %RH | 16-bit raw ADC, 1x oversampling |
| **Barometric Pressure** | 300 to 1100 hPa | ±1.0 hPa | Equivalent to altimeter range of -500m to +9000m |
| **I2C 7-bit Address** | `0x76` (`0xEC` W / `0xED` R) | When SDO pin is tied to Ground |

---

## 🛡️ PCB Layout & Electrical Best Practices

1. **I2C Pull-Up Resistors**:
   - Both SCL (`PB6`) and SDA (`PB7`) lines require external 4.7 kΩ pull-up resistors to 3.3V. While internal MCU pull-ups exist, they are weak (~40 kΩ) and cause slow rise times at 100 kHz.
2. **Decoupling Capacitors**:
   - Place a 0.1 µF (100 nF) ceramic capacitor in parallel with a 4.7 µF tantalum/ceramic capacitor as close as possible to the $V_{DD}$ pin of both the MAX30102 and BME280.
3. **USB Signal Integrity**:
   - `PA11` (USB D-) and `PA12` (USB D+) should be routed as a 90 Ω differential impedance pair with ground plane referencing and minimal trace stubs.
4. **Optical Isolation**:
   - For physiological readings with the MAX30102, protect the sensor window from direct ambient fluorescent/sunlight interference, which can saturate the photodiode.
