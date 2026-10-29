# STMPulseX Minimal Android App & BLE Bridge — Implementation Plan

> **Scope**: This plan covers **your** responsibilities as the Hardware & Embedded Lead: bringing up the BLE telemetry pipeline on the STM32WB55, validating it with a smartphone test tool, and building a bare-bones "Walking Skeleton" Android app to prove end-to-end data delivery before handing the mobile project over to your friend.

---

## 🎯 Objectives & Milestones

1. **Phase 1: STM32WB55 BLE Firmware Bringup**
   * Enable BLE stack on STM32WB55 (`STM32_WPAN`).
   * Advertise as `STMPulseX`.
   * Create custom GATT Service & Characteristic for sensor telemetry notifications.
   * Send simulated / live sensor readings packed into a clean binary payload.

2. **Phase 2: Smartphone Verification (Smoke Test)**
   * Scan, connect, and subscribe using **nRF Connect for Mobile**.
   * Confirm raw byte frames arrive reliably at 1 Hz without disconnection.

3. **Phase 3: Minimal Skeleton Android App (POC)**
   * Single-screen Android app (Kotlin).
   * Request Bluetooth runtime permissions (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`).
   * Auto-scan or tap "Connect" to link with `STMPulseX`.
   * Parse the binary payload.
   * Display all telemetry live on screen (BPM, SpO₂, Temps, Humidity, Pressure, Battery, Flags).

4. **Phase 4: Handover to Friend**
   * Document the BLE Interface Contract (UUIDs, byte offsets, data types).
   * Hand over the verified, building Android project as the starting baseline for the full Jetpack Compose UI, Room DB history, and graphs.

---

## 📡 1. BLE Interface Contract (The Handover Specification)

### Device & Service Identifiers

| Parameter | Value | Notes |
| :--- | :--- | :--- |
| **Advertised Device Name** | `STMPulseX` | Filter for this during BLE scanning |
| **Telemetry Service UUID** | `19B10000-E8F2-537E-4F6C-D104768A1214` | Custom 128-bit Service |
| **Telemetry Char UUID** | `19B10001-E8F2-537E-4F6C-D104768A1214` | Properties: **NOTIFY**, **READ** |
| **Update Frequency** | `1.0 Hz` | 1 notification packet per second |

### Binary Packet Structure (12 Bytes Total)

To guarantee that packets fit into the standard default BLE ATT MTU (23 bytes, 20 bytes data payload) without needing MTU negotiation, all telemetric channels are packed into **12 contiguous Little-Endian bytes**:

| Byte Offset | Field Name | Data Type | Scale / Range | Description / Example |
| :---: | :--- | :--- | :--- | :--- |
| **0 – 1** | `heart_rate` | `uint16_t` (LE) | 0 – 250 BPM | Heart rate (e.g. `72` = 72 BPM) |
| **2** | `spo2` | `uint8_t` | 0 – 100 % | Blood oxygen saturation (e.g. `98` = 98%) |
| **3 – 4** | `temp_skin` | `int16_t` (LE) | $\times 100$ | Contact temperature (e.g. `3650` = $36.50^\circ\text{C}$) |
| **5 – 6** | `temp_ambient` | `int16_t` (LE) | $\times 100$ | BME280 ambient temp (e.g. `2420` = $24.20^\circ\text{C}$) |
| **7** | `humidity` | `uint8_t` | 0 – 100 % | Relative humidity from BME280 |
| **8 – 9** | `pressure` | `uint16_t` (LE) | $\text{hPa} \times 10$ | Barometric pressure (e.g. `10132` = 1013.2 hPa) |
| **10** | `battery_pct` | `uint8_t` | 0 – 100 % | Battery charge percentage (simulated or ADC) |
| **11** | `status_flags` | `uint8_t` (Mask) | Bitmask | Diagnostics (Bit 0: Finger on sensor, Bit 1: MAX30102 OK, Bit 2: BME280 OK) |

---

## 🛠 2. Tooling & Environment Setup (Your PC)

* [x] **STM32CubeIDE 2.2.0**: Used for building and debugging the STM32WB55 firmware.
* [x] **STM32CubeProgrammer**: Used for flashing the BLE wireless coprocessor stack (`stm32wb5x_BLE_Stack_full_fw.bin`) to CPU2 if needed.
* [ ] **Android Studio** (Install via `winget install Google.AndroidStudio`): Used to scaffold and run the minimal skeleton Kotlin app.
* [ ] **Physical Android Smartphone**:
  * Developer Mode & USB Debugging enabled.
  * Installed **nRF Connect for Mobile** app (from Google Play Store).

---

## 📋 3. Step-by-Step Execution Plan

### Step 1: STM32WB55 BLE Firmware Configuration
1. Inspect `STMPulseX.ioc` in STM32CubeMX / CubeIDE.
2. Verify CPU2 (Cortex-M0+) wireless coprocessor stack status.
3. Enable `STM32_WPAN` middleware in BLE Peripheral mode.
4. Set device broadcast name to `STMPulseX`.
5. Implement the custom GATT service & characteristic in `custom_stm.c` / `app_ble.c`.
6. Start advertising on boot.
7. Set up a periodic 1-second timer that pushes mock/live 12-byte telemetry frames via GATT notification.

### Step 2: Smoke Testing with nRF Connect
1. Power up the STM32WB55 board.
2. Launch **nRF Connect** on your Android phone.
3. Scan for `STMPulseX` and check signal RSSI.
4. Tap **Connect** $\rightarrow$ Explore the GATT Service table.
5. Tap the three-arrow icon (**Enable Notifications**) on the Telemetry characteristic (`...-0001`).
6. Confirm hexadecimal byte streams increment every second.

### Step 3: Minimal Skeleton Android App
Build a clean, bare-bones Kotlin project in `STMPulseX_App/`:
* **Permissions Helper**: Requests `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` (Android 12+ / API 31+) and fine location for older versions.
* **BLE Scanner & Connector**: Simple callback-based or Coroutine-based `BluetoothGattCallback` connecting to `STMPulseX`.
* **Byte Parser**: A clean helper class `TelemetryParser.kt` converting the 12-byte payload into a Kotlin data class:
  ```kotlin
  data class TelemetryData(
      val heartRate: Int,
      val spO2: Int,
      val skinTemp: Float,
      val ambientTemp: Float,
      val humidity: Int,
      val pressure: Float,
      val battery: Int,
      val fingerDetected: Boolean
  )
  ```
* **Single Screen UI**:
  * Status indicator: `Disconnected` / `Scanning` / `Connected`
  * One "Connect" / "Disconnect" button
  * Text fields displaying each live parsed value.

### Step 4: Verification & Handover
1. Run the skeleton app on your phone via USB debugging.
2. Tap "Connect", place finger on the wearable sensor, and watch the numbers update on your phone.
3. Commit and push the code.
4. Hand off `STMPulseX_App/` to your friend.

---

## 🤝 Handover Boundary (What Your Friend Will Build Next)
Once your minimal skeleton is working, your friend takes over to implement:
* Modern Material 3 Jetpack Compose UI & Design.
* Real-time PPG / Heart Rate waveform graph plotting.
* Local SQLite / Room Database for 24-hour historical logs.
* Background sync service & automatic reconnection logic.
* High heart rate / temperature alert notifications.
