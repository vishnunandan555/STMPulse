# 🔌 USB CDC Virtual COM Port Architecture (`USB_Device/`)

[![USB Specification](https://img.shields.io/badge/USB-2.0%20Full--Speed%20(12%20Mbps)-blue.svg)](https://www.usb.org/)
[![Class](https://img.shields.io/badge/Class-CDC%20Virtual%20COM%20Port-orange.svg)]()
[![Driver](https://img.shields.io/badge/Driver-CDC%20ACM%20Standard-brightgreen.svg)]()

This technical document details the USB Communication Device Class (CDC) Virtual COM Port implementation running on the STM32WB55CGUx, including endpoint mapping, buffer flow control, enumeration parameters, and host driver compatibility.

---

## 📂 Source Code Structure

| File | Purpose |
|:---|:---|
| [`USB_Device/App/usb_device.c`](App/usb_device.c) | USB peripheral initialization, device class attachment, and stack startup |
| [`USB_Device/App/usbd_cdc_if.c`](App/usbd_cdc_if.c) | CDC media interface callbacks (`CDC_Init_FS`, `CDC_Transmit_FS`, `CDC_Receive_FS`) |
| [`USB_Device/App/usbd_desc.c`](App/usbd_desc.c) | Standard USB descriptors (Device, Configuration, String descriptors, VID/PID) |
| [`USB_Device/Target/usbd_conf.c`](Target/usbd_conf.c) | Hardware abstraction layer gluing STM32 Peripheral Controller Driver (PCD) to the USB core |

---

## ⚡ USB Architecture & Endpoints

The STM32WB55 integrates an embedded USB 2.0 Full-Speed (12 Mbit/s) device controller with dedicated 1024-byte packet buffer SRAM.

### Endpoint Allocation

```
                   ┌────────────────────────────────────────┐
                   │        STM32WB55 USB Controller        │
                   │        Dedicated 1 KB Packet RAM       │
                   └───────────────────┬────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
  Endpoint 0 (Control)           Endpoint 1 (Bulk)              Endpoint 2 (Interrupt)
  • Bi-directional (64 bytes)    • EP1 IN: Telemetry Transmit   • EP2 IN: Serial State
  • Standard Enumeration         • EP1 OUT: Host Commands       • Line coding notifications
  • Class Requests               • Max Packet Size: 64 bytes    • Max Packet Size: 8 bytes
```

| Endpoint | Type | Direction | Packet Size | Function in STMPulseX |
|:---|:---|:---|:---|:---|
| **EP0** | Control | Bidirectional | 64 bytes | Standard USB enumeration, descriptors, and CDC line coding requests |
| **EP1 IN** | Bulk | Device to Host | 64 bytes | High-speed telemetry transmission (biosignals & environmental data) |
| **EP1 OUT** | Bulk | Host to Device | 64 bytes | Downlink command channel |
| **EP2 IN** | Interrupt | Device to Host | 8 bytes | CDC Notification (Serial state, carrier detect, DSR) |

---

## ⏱ Transmit Flow Control (`CDC_Transmit_FS`)

In high-throughput telemetric streams (such as 25 Hz ASCII strings), transmitting faster than the USB host consumes packets can result in buffer contention.

The firmware guards against re-entrant calls via the class transmission state flag:

```c
uint8_t CDC_Transmit_FS(uint8_t* Buf, uint16_t Len)
{
  uint8_t result = USBD_OK;
  USBD_CDC_HandleTypeDef *hcdc = (USBD_CDC_HandleTypeDef*)hUsbDeviceFS.pClassData;
  
  if (hcdc->TxState != 0) {
    return USBD_BUSY; // Host has not yet acknowledged prior packet
  }
  
  USBD_CDC_SetTxBuffer(&hUsbDeviceFS, Buf, Len);
  result = USBD_CDC_TransmitPacket(&hUsbDeviceFS);
  return result;
}
```

- When `USBD_BUSY` occurs, the telemetry scheduler drops or defers the packet rather than blocking the real-time sensor loop.
- A small safety delay (`HAL_Delay(10)`) in `usb_log()` ensures the physical PHY completes the 64-byte packet transfer before the next telemetry frame is formatted.

---

## 💻 Operating System Drivers & Setup

Because STMPulseX implements standard USB CDC ACM (Abstract Control Model), no custom third-party drivers are required on modern platforms:

### 1. Windows 10 & Windows 11
- Automatically attaches the built-in Microsoft inbox driver: `usbser.sys`.
- Appears in Device Manager under **Ports (COM & LPT)** as:
  `STMicroelectronics Virtual COM Port (COMx)`

### 2. Linux (Ubuntu, Debian, Fedora, Arch)
- Automatically recognized by the kernel module `cdc_acm`.
- Appears under:
  `/dev/ttyACM0`
- **Permissions Note**: Ensure user belongs to `dialout` or `plugdev` group:
  ```bash
  sudo usermod -a -G dialout $USER
  ```

### 3. macOS
- Automatically mounted by the native IOKit CDC driver under:
  `/dev/tty.usbmodem*` or `/dev/cu.usbmodem*`

---

## 🛠 Collaborator Troubleshooting

| Issue | Root Cause | Solution |
|:---|:---|:---|
| Device not recognized (Code 43 or Unknown Device) | USB clock is not precisely 48 MHz | Verify that `SystemClock_Config()` sets `PLLQ = 2` from a 128 MHz VCO, giving 48 MHz. Also confirm `HAL_PWREx_EnableVddUSB()` is executed in `HAL_MspInit()`. |
| Port appears in Device Manager but cannot be opened in browser | Port locked by an active serial console | Close any active PuTTY, Tera Term, or Arduino Serial Monitor windows before launching `dashboard.html`. |
| Packet truncation or missing lines | Transmission size exceeds buffer | Ensure formatted telemetry strings remain below the `APP_TX_DATA_SIZE` buffer threshold. |
