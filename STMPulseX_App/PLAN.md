# STMPulseX Minimal Android App & BLE Bridge — Implementation Plan

> **Scope**: This plan covers **your** responsibilities as the Hardware & Embedded Lead: bringing up the BLE telemetry pipeline on the STM32WB55, validating it with a smartphone test tool, and building a bare-bones "Walking Skeleton" Android app to prove end-to-end data delivery before handing the mobile project over to your friend.

---

## 🎯 Objectives & Milestones

1. **Phase 0: Hardware Debugger Bringup (ST-Link Coprocessor Flash) — [TOMORROW]**
   * Wire ST-Link (SWD) to STM32WB55 Ubyte EVAL board.
   * Verify FUS (Firmware Upgrade Service) state via ST-Link in STM32CubeProgrammer.
   * Flash `stm32wb5x_BLE_Stack_full_fw.bin` into CPU2 secure flash (`0x080CE000`).
   * Re-enable BLE initialization in `Core/Src/main.c` and flash `STMPulseX.elf`.

2. **Phase 1: Smartphone Verification (Smoke Test)**
   * Scan, connect, and subscribe using **nRF Connect for Mobile**.
   * Confirm raw byte frames arrive reliably at 1 Hz without disconnection.

3. **Phase 2: Minimal Skeleton Android App (POC)**
   * Single-screen Android app (Kotlin).
   * Request Bluetooth runtime permissions (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`).
   * Auto-scan or tap "Connect" to link with `STMPulseX`.
   * Parse the binary payload.
   * Display all telemetry live on screen (BPM, SpO₂, Temps, Humidity, Pressure, Battery, Flags).

4. **Phase 3: Handover to Friend**
   * Document the BLE Interface Contract (UUIDs, byte offsets, data types).
   * Hand over the verified, building Android project as the starting baseline for the full Jetpack Compose UI, Room DB history, and graphs.

---

## ⚡ Phase 0: ST-Link Bringup Guide (Tomorrow's Hardware Procedure)

### 1. SWD Pinout Connections (Only 4 Wires)
Connect the borrowed ST-Link V2 (or Nucleo ST-Link header) to the STM32WB55 board pins:

| ST-Link Pin | STM32WB55 Board Pin | Notes |
| :--- | :--- | :--- |
| **SWCLK** | **SWCLK** (PA14) | Hardware clock line |
| **SWDIO** | **SWDIO** (PA13) | Bi-directional debug data |
| **GND** | **GND** | Common reference ground |
| **3.3V** | **3.3V** | ST-Link target voltage reference (or keep board USB plugged in) |
| *NRST (Optional)* | *RST* | Hardware reset line (recommended if available) |

---

### 2. Flashing the Wireless Coprocessor (CPU2 BLE Stack)

1. **Connect ST-Link to PC** via USB, keep board wired to ST-Link.
2. Launch **STM32CubeProgrammer**:
   * Set interface dropdown (top-right) from `USB` $\rightarrow$ **`ST-LINK`**.
   * Mode: `Normal` (or `Under Reset`).
   * Reset mode: `Software reset`.
   * Frequency: `4000 kHz`.
   * Click **Connect** (Direct hardware CoreSight DAP connection established immediately).
3. **Verify FUS (Firmware Upgrade Service)**:
   * Click the **Firmware Upgrade Services** icon (antenna icon on the left navigation bar).
   * Click **Read FUS infos**.
   * Status will report `FUS_IDLE` with `FUS Version: v2.2.0.0`.
4. **Flash the BLE Stack Binary**:
   * Click **Browse** under Firmware Upgrade.
   * Select:
     ```text
     C:\Users\vishn\STM32Cube\Repository\STM32Cube_FW_WB_V1.24.0\Projects\STM32WB_Coprocessor_Wireless_Binaries\STM32WB5x\stm32wb5x_BLE_Stack_full_fw.bin
     ```
   * Ensure *Start address automatic determination* is checked (or specify `0x080CE000`).
   * Click **Firmware Upgrade**.
   * Operation takes ~10–15 seconds and prints:
     `Firmware Upgrade Success`
5. **Re-read Coprocessor Info**:
   * Click **Read FUS infos** again.
   * Confirm: `STACK Version: v1.24.0.x` is active at `0x080CE000`.

---

### 3. Re-enable BLE in Firmware & Flash

Once CPU2 has the BLE stack:
1. Open [`Core/Src/main.c`](file:///c:/Users/vishn/Projects/STM/STMPulseX/Core/Src/main.c):
   * Uncomment line 160: `while(LL_HSEM_1StepLock(HSEM, CFG_HW_CLK48_CONFIG_SEMID));`
   * Uncomment line 163: `MX_APPE_Init();`
   * Uncomment line 174: `MX_APPE_Process();`
   * Uncomment line 256: `Custom_STM_App_Update_Char(CUSTOM_STM_TEL, ble_pkt);`
2. Rebuild project:
   ```cmd
   cmd.exe /c "C:\Users\vishn\Projects\STM\build.bat"
   ```
3. Flash `STMPulseX.elf` via ST-Link in STM32CubeProgrammer at address `0x08000000`.
4. Disconnect ST-Link, boot board normally. CPU1 and CPU2 will synchronize and begin advertising as `STMPulseX` while continuing 25 Hz USB CDC telemetry.

---

## 📡 1. BLE Interface Contract (The Handover Specification)

### Device & Service Identifiers

| Parameter | Value | Notes |
| :--- | :--- | :--- |
| **Advertised Device Name** | `STMPulseX` | Filter for this during BLE scanning |
| **Telemetry Service UUID** | `00000001-cc7a-482a-984a-7f2ed5b3e58f` | Custom 128-bit Service |
| **Telemetry Char UUID** | `00000002-8e22-4541-9d4c-21edae82ed19` | Properties: **NOTIFY**, **READ** |
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
* [x] **STM32CubeProgrammer**: Used for flashing the BLE wireless coprocessor stack (`stm32wb5x_BLE_Stack_full_fw.bin`) to CPU2 via ST-Link.
* [ ] **Android Studio** (Install via `winget install Google.AndroidStudio`): Used to scaffold and run the minimal skeleton Kotlin app.
* [ ] **Physical Android Smartphone**:
  * Developer Mode & USB Debugging enabled.
  * Installed **nRF Connect for Mobile** app (from Google Play Store).

---

## 📋 3. Step-by-Step Execution Plan

### Step 1: Smoke Testing with nRF Connect
1. Power up the STM32WB55 board.
2. Launch **nRF Connect** on your Android phone.
3. Scan for `STMPulseX` and check signal RSSI.
4. Tap **Connect** $\rightarrow$ Explore the GATT Service table.
5. Tap the three-arrow icon (**Enable Notifications**) on the Telemetry characteristic (`...-0002`).
6. Confirm hexadecimal 12-byte stream increments every second.

### Step 2: Minimal Skeleton Android App
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

### Step 3: Verification & Handover
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
