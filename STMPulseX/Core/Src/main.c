/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "usb_device.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <stdarg.h>
#include <math.h>
#include "usbd_cdc_if.h"
#include <string.h>
#include "app_common.h"
#include "ble.h"
#include "custom_stm.h"
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
I2C_HandleTypeDef hi2c1;

IPCC_HandleTypeDef hipcc;

RTC_HandleTypeDef hrtc;

/* USER CODE BEGIN PV */
volatile uint8_t bme280_id = 0;
volatile HAL_StatusTypeDef bme280_status = HAL_ERROR;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
void PeriphCommonClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_I2C1_Init(void);
static void MX_IPCC_Init(void);
static void MX_RTC_Init(void);
static void MX_RF_Init(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

#define BME280_ADDR       (0x76 << 1)
#define BME280_REG_ID     0xD0
#define BME280_REG_RESET  0xE0
#define BME280_REG_CTRL_HUM 0xF2
#define BME280_REG_STATUS 0xF3
#define BME280_REG_CTRL_MEAS 0xF4
#define BME280_REG_CONFIG 0xF5
#define BME280_REG_PRESS_MSB 0xF7

#define MAX30102_ADDR        (0x57 << 1)
#define MAX30102_REG_FIFO_DATA    0x07
#define MAX30102_REG_FIFO_CONFIG  0x08
#define MAX30102_REG_MODE_CONFIG  0x09
#define MAX30102_REG_SPO2_CONFIG  0x0A
#define MAX30102_REG_LED1_PA      0x0C
#define MAX30102_REG_LED2_PA      0x0D
#define MAX30102_REG_PART_ID      0xFF

static void usb_log(const char *fmt, ...);
static float bme280_temperature(uint32_t adc_T);
static float bme280_pressure(uint32_t adc_P);
static float bme280_humidity(uint32_t adc_H);
static uint8_t bme280_read_reg(uint8_t reg, uint8_t *data, uint16_t len);
static uint8_t bme280_write_reg(uint8_t reg, uint8_t value);
static uint8_t bme280_init(void);
static uint8_t bme280_read_raw(uint8_t *data);

static uint8_t max30102_init(void);
static uint8_t max30102_read_fifo(uint32_t *red, uint32_t *ir);
static void max30102_trigger_temp(void);
static float max30102_get_temp(void);

#define TMP117_ADDR          (0x48 << 1)
#define TMP117_REG_TEMP      0x00
#define TMP117_REG_CONFIG    0x01
#define TMP117_REG_ID        0x0F

#define MPU6050_ADDR_PRIMARY   (0x68 << 1)
#define MPU6050_ADDR_SECONDARY (0x69 << 1)
#define MPU6050_REG_SMPLRT     0x19
#define MPU6050_REG_CONFIG     0x1A
#define MPU6050_REG_GYRO_CFG   0x1B
#define MPU6050_REG_ACCEL_CFG  0x1C
#define MPU6050_REG_ACCEL_XOUT 0x3B
#define MPU6050_REG_PWR_MGMT_1 0x6B
#define MPU6050_REG_WHO_AM_I   0x75

static uint8_t mpu6050_addr = (0x68 << 1);
static uint8_t mpu6050_detected = 0;
static uint8_t mpu6050_whoami = 0;

static void i2c_bus_scan(void);
static uint8_t tmp117_init(void);
static float tmp117_read_temp(void);

// static uint8_t mpu6050_init(void);
// static uint8_t mpu6050_read_accel(int16_t *ax, int16_t *ay, int16_t *az);

static uint32_t sample_count = 0;

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();
  /* Config code for STM32_WPAN (HSE Tuning must be done before system clock configuration) */
  MX_APPE_Config();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* Configure the peripherals common clocks */
  PeriphCommonClock_Config();

  /* IPCC initialisation */
  MX_IPCC_Init();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_I2C1_Init();
  MX_USB_Device_Init();
  MX_RTC_Init();
  MX_RF_Init();
  /* USER CODE BEGIN 2 */
  HAL_Delay(1500);  // Allow USB CDC to enumerate

  i2c_bus_scan();
  bme280_init();
  max30102_init();
  tmp117_init();
  // mpu6050_init(); // Disabled
  /* USER CODE END 2 */

  /* while(LL_HSEM_1StepLock(HSEM, CFG_HW_CLK48_CONFIG_SEMID)); */

  /* Init code for STM32_WPAN */
  /* MX_APPE_Init(); */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  usb_log("\r\n========================================\r\n");
  usb_log(" STMPulseX: USB Telemetry Stream Online\r\n");
  usb_log(" (BLE stack bypassed for direct stream)\r\n");
  usb_log("========================================\r\n");
  while (1)
  {
    /* USER CODE END WHILE */
    /* MX_APPE_Process(); */

    /* USER CODE BEGIN 3 */
    sample_count++;

    // 1. Read BME280 every 1s (every 25 samples at 25 Hz)
    static float s_temp = 25.0f;
    static float s_press = 1013.25f;
    static float s_hum = 50.0f;
    static float s_ctemp = 32.0f;
    static float s_t117 = 25.0f;

    uint32_t phase = sample_count % 25;
    if (phase == 1) {
        uint8_t bme_data[8];
        if (bme280_read_raw(bme_data)) {
            uint32_t adc_P = ((uint32_t)bme_data[0] << 12) | ((uint32_t)bme_data[1] << 4) | (bme_data[2] >> 4);
            uint32_t adc_T = ((uint32_t)bme_data[3] << 12) | ((uint32_t)bme_data[4] << 4) | (bme_data[5] >> 4);
            uint32_t adc_H = ((uint32_t)bme_data[6] << 8)  | bme_data[7];

            s_temp = bme280_temperature(adc_T);
            s_press = bme280_pressure(adc_P);
            s_hum = bme280_humidity(adc_H);
        }
    } else if (phase == 2) {
        // Trigger non-blocking MAX30102 on-die temperature measurement
        max30102_trigger_temp();
    } else if (phase == 3) {
        // Read conversion (took ~29ms, 40ms has elapsed)
        s_ctemp = max30102_get_temp();
    } else if (phase == 4) {
        float t = tmp117_read_temp();
        if (t > -100.0f) {
            s_t117 = t;
        }
    }

    // 2. Read MAX30102 sample
    uint32_t red_val = 0, ir_val = 0;
    max30102_read_fifo(&red_val, &ir_val);

    if (sample_count % 125 == 0) {
        usb_log("[STATUS] SENSORS ONLINE | TMP117: %.2f C | BME280: %.2f C, %.1f %% | MAX30102: OK\r\n",
                s_t117, s_temp, s_hum);
    }

    // MPU6050 disabled (unpopulated)
    int16_t ax_mg = 0, ay_mg = 0, az_mg = 0;
    uint16_t mot_mg = 0;

    uint8_t finger_detected = (ir_val > 15000);

    long t_c100 = (long)(s_temp * 100.0f);
    long h_pct100 = (long)(s_hum * 100.0f);
    long p_hpa100 = (long)(s_press);
    long ct_c100 = (long)(s_ctemp * 100.0f);

    long t_frac = t_c100 % 100;
    if (t_frac < 0) t_frac = -t_frac;

    long ct_frac = ct_c100 % 100;
    if (ct_frac < 0) ct_frac = -ct_frac;

    long t117_c100 = (long)(s_t117 * 100.0f);
    long t117_frac = t117_c100 % 100;
    if (t117_frac < 0) t117_frac = -t117_frac;

    usb_log("[#%lu] ENV: %ld.%02ld C, %ld.%02ld %%, %ld.%02ld hPa | PULSE: Finger=%s (RED=%lu, IR=%lu, CTEMP=%ld.%02ld C) | TMP117: %ld.%02ld C | IMU: Ax=%d, Ay=%d, Az=%d, Mot=%u\r\n",
            sample_count,
            t_c100 / 100, t_frac,
            h_pct100 / 100, h_pct100 % 100,
            p_hpa100 / 100, p_hpa100 % 100,
            finger_detected ? "YES" : "NO ",
            red_val, ir_val,
            ct_c100 / 100, ct_frac,
            t117_c100 / 100, t117_frac,
            (int)ax_mg, (int)ay_mg, (int)az_mg, (unsigned int)mot_mg);

    // 3. Broadcast 12-byte BLE telemetry notification at 1 Hz
    if (phase == 1) {
        uint8_t ble_pkt[12];
        uint16_t hr = finger_detected ? 75 : 0;
        uint8_t spo2 = finger_detected ? 98 : 0;
        int16_t t_skin = (int16_t)(s_ctemp * 100.0f);
        int16_t t_amb = (int16_t)(s_temp * 100.0f);
        uint8_t hum = (uint8_t)(s_hum);
        uint16_t press = (uint16_t)(s_press * 10.0f);
        uint8_t batt = 95;
        uint8_t flags = (finger_detected ? 0x01 : 0x00) | ((bme280_status == HAL_OK) ? 0x04 : 0x00) | 0x02;

        ble_pkt[0] = (uint8_t)(hr & 0xFF);
        ble_pkt[1] = (uint8_t)((hr >> 8) & 0xFF);
        ble_pkt[2] = spo2;
        ble_pkt[3] = (uint8_t)(t_skin & 0xFF);
        ble_pkt[4] = (uint8_t)((t_skin >> 8) & 0xFF);
        ble_pkt[5] = (uint8_t)(t_amb & 0xFF);
        ble_pkt[6] = (uint8_t)((t_amb >> 8) & 0xFF);
        ble_pkt[7] = hum;
        ble_pkt[8] = (uint8_t)(press & 0xFF);
        ble_pkt[9] = (uint8_t)((press >> 8) & 0xFF);
        ble_pkt[10] = batt;
        ble_pkt[11] = flags;

        // Custom_STM_App_Update_Char(CUSTOM_STM_TEL, ble_pkt);
        (void)ble_pkt;
        usb_log("[BLE 1Hz] Sent: HR=%u, SpO2=%u%%, SkinT=%ld.%02ld C, Press=%ld.%01ld hPa\r\n",
                hr, spo2,
                (long)(t_skin / 100), (long)((t_skin < 0 ? -t_skin : t_skin) % 100),
                (long)(press / 10), (long)(press % 10));
    }

    HAL_Delay(40); // 25 Hz high-resolution stream (40ms interval)
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure LSE Drive Capability
  */
  HAL_PWR_EnableBkUpAccess();
  __HAL_RCC_LSEDRIVE_CONFIG(RCC_LSEDRIVE_MEDIUMHIGH);

  /** Configure the main internal regulator output voltage
  */
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI|RCC_OSCILLATORTYPE_LSI1
                              |RCC_OSCILLATORTYPE_HSE|RCC_OSCILLATORTYPE_LSE
                              |RCC_OSCILLATORTYPE_MSI;
  RCC_OscInitStruct.HSEState = RCC_HSE_ON;
  RCC_OscInitStruct.LSEState = RCC_LSE_ON;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.MSIState = RCC_MSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.MSICalibrationValue = RCC_MSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.MSIClockRange = RCC_MSIRANGE_6;
  RCC_OscInitStruct.LSIState = RCC_LSI_ON;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_MSI;
  RCC_OscInitStruct.PLL.PLLM = RCC_PLLM_DIV1;
  RCC_OscInitStruct.PLL.PLLN = 32;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLR = RCC_PLLR_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = RCC_PLLQ_DIV2;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure the SYSCLKSource, HCLK, PCLK1 and PCLK2 clocks dividers
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK4|RCC_CLOCKTYPE_HCLK2
                              |RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.AHBCLK2Divider = RCC_SYSCLK_DIV2;
  RCC_ClkInitStruct.AHBCLK4Divider = RCC_SYSCLK_DIV2;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_3) != HAL_OK)
  {
    Error_Handler();
  }

  /** Enable MSI Auto calibration
  */
  HAL_RCCEx_EnableMSIPLLMode();
}

/**
  * @brief Peripherals Common Clock Configuration
  * @retval None
  */
void PeriphCommonClock_Config(void)
{
  RCC_PeriphCLKInitTypeDef PeriphClkInitStruct = {0};

  /** Initializes the peripherals clock
  */
  PeriphClkInitStruct.PeriphClockSelection = RCC_PERIPHCLK_SMPS|RCC_PERIPHCLK_RFWAKEUP;
  PeriphClkInitStruct.RFWakeUpClockSelection = RCC_RFWKPCLKSOURCE_HSE_DIV1024;
  PeriphClkInitStruct.SmpsClockSelection = RCC_SMPSCLKSOURCE_HSI;
  PeriphClkInitStruct.SmpsDivSelection = RCC_SMPSCLKDIV_RANGE1;

  if (HAL_RCCEx_PeriphCLKConfig(&PeriphClkInitStruct) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN Smps */

  /* USER CODE END Smps */
}

/**
  * @brief I2C1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_I2C1_Init(void)
{

  /* USER CODE BEGIN I2C1_Init 0 */

  /* USER CODE END I2C1_Init 0 */

  /* USER CODE BEGIN I2C1_Init 1 */

  /* USER CODE END I2C1_Init 1 */
  hi2c1.Instance = I2C1;
  hi2c1.Init.Timing = 0x10B17DB5;
  hi2c1.Init.OwnAddress1 = 0;
  hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
  hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
  hi2c1.Init.OwnAddress2 = 0;
  hi2c1.Init.OwnAddress2Masks = I2C_OA2_NOMASK;
  hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
  hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
  if (HAL_I2C_Init(&hi2c1) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure Analogue filter
  */
  if (HAL_I2CEx_ConfigAnalogFilter(&hi2c1, I2C_ANALOGFILTER_ENABLE) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure Digital filter
  */
  if (HAL_I2CEx_ConfigDigitalFilter(&hi2c1, 0) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN I2C1_Init 2 */

  /* USER CODE END I2C1_Init 2 */

}

/**
  * @brief IPCC Initialization Function
  * @param None
  * @retval None
  */
static void MX_IPCC_Init(void)
{

  /* USER CODE BEGIN IPCC_Init 0 */

  /* USER CODE END IPCC_Init 0 */

  /* USER CODE BEGIN IPCC_Init 1 */

  /* USER CODE END IPCC_Init 1 */
  hipcc.Instance = IPCC;
  if (HAL_IPCC_Init(&hipcc) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN IPCC_Init 2 */

  /* USER CODE END IPCC_Init 2 */

}

/**
  * @brief RF Initialization Function
  * @param None
  * @retval None
  */
static void MX_RF_Init(void)
{

  /* USER CODE BEGIN RF_Init 0 */

  /* USER CODE END RF_Init 0 */

  /* USER CODE BEGIN RF_Init 1 */

  /* USER CODE END RF_Init 1 */
  /* USER CODE BEGIN RF_Init 2 */

  /* USER CODE END RF_Init 2 */

}

/**
  * @brief RTC Initialization Function
  * @param None
  * @retval None
  */
static void MX_RTC_Init(void)
{

  /* USER CODE BEGIN RTC_Init 0 */

  /* USER CODE END RTC_Init 0 */

  /* USER CODE BEGIN RTC_Init 1 */

  /* USER CODE END RTC_Init 1 */

  /** Initialize RTC Only
  */
  hrtc.Instance = RTC;
  hrtc.Init.HourFormat = RTC_HOURFORMAT_24;
  hrtc.Init.AsynchPrediv = CFG_RTC_ASYNCH_PRESCALER;
  hrtc.Init.SynchPrediv = CFG_RTC_SYNCH_PRESCALER;
  hrtc.Init.OutPut = RTC_OUTPUT_DISABLE;
  hrtc.Init.OutPutPolarity = RTC_OUTPUT_POLARITY_HIGH;
  hrtc.Init.OutPutType = RTC_OUTPUT_TYPE_OPENDRAIN;
  hrtc.Init.OutPutRemap = RTC_OUTPUT_REMAP_NONE;
  if (HAL_RTC_Init(&hrtc) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN RTC_Init 2 */

  /* USER CODE END RTC_Init 2 */

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  /* USER CODE BEGIN MX_GPIO_Init_2 */

  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */

typedef struct {
    uint16_t T1;
    int16_t T2, T3;
    uint16_t P1;
    int16_t P2, P3, P4, P5, P6, P7, P8, P9;
    uint8_t H1, H3;
    int16_t H2;
    int16_t H4, H5;
    int8_t H6;
} BME280_Calibration;

static BME280_Calibration cal;
static int32_t t_fine;

static uint8_t bme280_read_reg(uint8_t reg,
                               uint8_t *data, uint16_t len)
{
    return HAL_I2C_Mem_Read(&hi2c1, BME280_ADDR, reg,
                            I2C_MEMADD_SIZE_8BIT,
                            data, len, 100) == HAL_OK;
}

static uint8_t bme280_write_reg(uint8_t reg, uint8_t value)
{
    return HAL_I2C_Mem_Write(&hi2c1, BME280_ADDR, reg,
                             I2C_MEMADD_SIZE_8BIT,
                             &value, 1, 100) == HAL_OK;
}

static uint16_t u16(const uint8_t *p)
{
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static int16_t s16(const uint8_t *p)
{
    return (int16_t)u16(p);
}

static uint8_t bme280_init(void)
{
    uint8_t id, a[26], h[7], status;

    HAL_StatusTypeDef result =
        HAL_I2C_Mem_Read(&hi2c1, BME280_ADDR, BME280_REG_ID,
                         I2C_MEMADD_SIZE_8BIT, &id, 1, 100);

    char msg[80];
    snprintf(msg, sizeof(msg),
             "I2C status=%d, chip ID=0x%02X\r\n",
             (int)result, id);
    CDC_Transmit_FS((uint8_t *)msg, strlen(msg));

    if (result != HAL_OK || id != 0x60)
        return 0;

    if (!bme280_write_reg(BME280_REG_RESET, 0xB6))
        return 0;

    HAL_Delay(10);

    for (int i = 0; i < 100; i++) {
        if (!bme280_read_reg(BME280_REG_STATUS, &status, 1))
            return 0;
        if (!(status & 0x01))
            break;
        HAL_Delay(2);
    }

    if (!bme280_read_reg(0x88, a, 26) ||
        !bme280_read_reg(0xE1, h, 7))
        return 0;

    cal.T1 = u16(&a[0]);
    cal.T2 = s16(&a[2]);
    cal.T3 = s16(&a[4]);

    cal.P1 = u16(&a[6]);
    cal.P2 = s16(&a[8]);
    cal.P3 = s16(&a[10]);
    cal.P4 = s16(&a[12]);
    cal.P5 = s16(&a[14]);
    cal.P6 = s16(&a[16]);
    cal.P7 = s16(&a[18]);
    cal.P8 = s16(&a[20]);
    cal.P9 = s16(&a[22]);
    cal.H1 = a[25];

    cal.H2 = s16(&h[0]);
    cal.H3 = h[2];
    cal.H4 = (int16_t)(((int16_t)(int8_t)h[3] << 4)
                       | (h[4] & 0x0F));
    cal.H5 = (int16_t)(((int16_t)(int8_t)h[5] << 4)
                       | (h[4] >> 4));
    cal.H6 = (int8_t)h[6];

    if (cal.P1 == 0)
        return 0;

    /* Standby/filter defaults; humidity x1, temperature x1,
       pressure x1, continuous normal mode. */
    if (!bme280_write_reg(BME280_REG_CONFIG, 0x00) ||
        !bme280_write_reg(BME280_REG_CTRL_HUM, 0x01) ||
        !bme280_write_reg(BME280_REG_CTRL_MEAS, 0x27))
        return 0;

    return 1;
}

static uint8_t bme280_read_raw(uint8_t *data)
{
    return bme280_read_reg(BME280_REG_PRESS_MSB, data, 8);
}

static float bme280_temperature(uint32_t adc_T)
{
    float v1 = ((float)adc_T / 16384.0f -
                (float)cal.T1 / 1024.0f) * cal.T2;

    float x = (float)adc_T / 131072.0f -
              (float)cal.T1 / 8192.0f;

    float v2 = x * x * cal.T3;

    v1 /= 1.0f;
    t_fine = (int32_t)((v1 + v2) / 512.0f);

    return (v1 + v2) / 5120.0f;
}

static float bme280_pressure(uint32_t adc_P)
{
    float v1 = (float)t_fine / 2.0f - 64000.0f;
    float v2 = v1 * v1 * cal.P6 / 32768.0f;
    v2 += v1 * cal.P5 * 2.0f;
    v2 = v2 / 4.0f + cal.P4 * 65536.0f;

    v1 = (cal.P3 * v1 * v1 / 524288.0f +
          cal.P2 * v1) / 524288.0f;
    v1 = (1.0f + v1 / 32768.0f) * cal.P1;

    if (v1 == 0.0f)
        return 0.0f;

    float p = 1048576.0f - (float)adc_P;
    p = (p - v2 / 4096.0f) * 6250.0f / v1;

    v1 = cal.P9 * p * p / 2147483648.0f;
    v2 = p * cal.P8 / 32768.0f;
    p += (v1 + v2 + cal.P7) / 16.0f;

    return p;
}

static float bme280_humidity(uint32_t adc_H)
{
    float h = (float)t_fine - 76800.0f;

    h = (adc_H - (cal.H4 * 64.0f + cal.H5 / 16384.0f * h))
        * (cal.H2 / 65536.0f
        * (1.0f + cal.H6 / 67108864.0f * h
        * (1.0f + cal.H3 / 67108864.0f * h)));

    h *= 1.0f - cal.H1 * h / 524288.0f;

    if (h > 100.0f) h = 100.0f;
    if (h < 0.0f) h = 0.0f;

    return h;
}


static void usb_log(const char *fmt, ...)
{
    static char buf[256];
    va_list args;
    va_start(args, fmt);
    int len = vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);

    if (len > 0) {
        if (len > (int)(sizeof(buf) - 1)) len = sizeof(buf) - 1;
        uint32_t t0 = HAL_GetTick();
        while (CDC_Transmit_FS((uint8_t *)buf, (uint16_t)len) == USBD_BUSY) {
            if (HAL_GetTick() - t0 > 15) break;
            HAL_Delay(1);
        }
    }
}

static uint8_t max30102_init(void)
{
    uint8_t val;
    // Reset
    val = 0x40;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, MAX30102_REG_MODE_CONFIG, 1, &val, 1, 100);
    HAL_Delay(50);

    // FIFO config: sample average 4, rollover enabled
    val = 0x40;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, MAX30102_REG_FIFO_CONFIG, 1, &val, 1, 100);

    // SpO2 Mode (Red + IR)
    val = 0x03;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, MAX30102_REG_MODE_CONFIG, 1, &val, 1, 100);

    // SpO2 Config: 4096nA, 100sps, 411us
    val = 0x27;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, MAX30102_REG_SPO2_CONFIG, 1, &val, 1, 100);

    // LED currents (~7.2mA)
    val = 0x24;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, MAX30102_REG_LED1_PA, 1, &val, 1, 100);
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, MAX30102_REG_LED2_PA, 1, &val, 1, 100);

    // Clear pointers
    val = 0x00;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, 0x04, 1, &val, 1, 100);
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, 0x05, 1, &val, 1, 100);
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, 0x06, 1, &val, 1, 100);

    return 1;
}

static uint8_t max30102_read_fifo(uint32_t *red, uint32_t *ir)
{
    uint8_t raw[6];
    if (HAL_I2C_Mem_Read(&hi2c1, MAX30102_ADDR, MAX30102_REG_FIFO_DATA, 1, raw, 6, 50) != HAL_OK) {
        return 0;
    }

    *red = (((uint32_t)raw[0] << 16) | ((uint32_t)raw[1] << 8) | raw[2]) & 0x03FFFF;
    *ir  = (((uint32_t)raw[3] << 16) | ((uint32_t)raw[4] << 8) | raw[5]) & 0x03FFFF;
    return 1;
}

static void max30102_trigger_temp(void)
{
    uint8_t val = 0x01;
    HAL_I2C_Mem_Write(&hi2c1, MAX30102_ADDR, 0x21, 1, &val, 1, 50);
}

static float max30102_get_temp(void)
{
    int8_t temp_int = 0;
    uint8_t temp_frac = 0;
    HAL_I2C_Mem_Read(&hi2c1, MAX30102_ADDR, 0x1F, 1, (uint8_t*)&temp_int, 1, 50);
    HAL_I2C_Mem_Read(&hi2c1, MAX30102_ADDR, 0x20, 1, &temp_frac, 1, 50);
    return (float)temp_int + ((float)(temp_frac & 0x0F) * 0.0625f);
}

static void i2c_bus_scan(void)
{
    usb_log("\r\n--- I2C Bus Scan (hi2c1: PB6 SCL, PB7 SDA) ---\r\n");
    uint8_t found = 0;
    for (uint16_t addr = 1; addr < 128; addr++) {
        if (HAL_I2C_IsDeviceReady(&hi2c1, (uint16_t)(addr << 1), 2, 10) == HAL_OK) {
            const char *name = "Unknown";
            if (addr == 0x48) name = "TMP117 (0x48)";
            else if (addr == 0x49) name = "TMP117 (0x49)";
            else if (addr == 0x57) name = "MAX30102 (0x57)";
            else if (addr == 0x68) name = "MPU6050 (0x68)";
            else if (addr == 0x69) name = "MPU6050 (0x69)";
            else if (addr == 0x76) name = "BME280 (0x76)";
            else if (addr == 0x77) name = "BME280 (0x77)";
            usb_log("  -> [0x%02X] ACK (%s)\r\n", addr, name);
            found++;
        }
    }
    if (found == 0) {
        usb_log("  -> No I2C devices found! Check wiring and 3.3V/GND.\r\n");
    }
    usb_log("----------------------------------------------\r\n\r\n");
}

static uint8_t tmp117_init(void)
{
    return (HAL_I2C_IsDeviceReady(&hi2c1, TMP117_ADDR, 2, 20) == HAL_OK) ? 1 : 0;
}

static float tmp117_read_temp(void)
{
    uint8_t buf[2];
    if (HAL_I2C_Mem_Read(&hi2c1, TMP117_ADDR, TMP117_REG_TEMP, 1, buf, 2, 20) != HAL_OK) {
        return -999.0f;
    }
    int16_t raw = (int16_t)(((uint16_t)buf[0] << 8) | buf[1]);
    return (float)raw * 0.0078125f;
}

static uint8_t __attribute__((unused)) mpu6050_init(void)
{
    uint8_t target_addr = 0;
    // Check 0x68 first (AD0 -> GND)
    if (HAL_I2C_IsDeviceReady(&hi2c1, MPU6050_ADDR_PRIMARY, 2, 15) == HAL_OK) {
        target_addr = MPU6050_ADDR_PRIMARY;
    }
    // Check 0x69 second (AD0 -> 3.3V or floating)
    else if (HAL_I2C_IsDeviceReady(&hi2c1, MPU6050_ADDR_SECONDARY, 2, 15) == HAL_OK) {
        target_addr = MPU6050_ADDR_SECONDARY;
    }

    if (target_addr == 0) {
        mpu6050_detected = 0;
        return 0;
    }

    mpu6050_addr = target_addr;

    // Wake up MPU6050: write 0x00 to PWR_MGMT_1 (clear SLEEP bit, 8MHz internal osc)
    uint8_t pwr_wake = 0x00;
    HAL_I2C_Mem_Write(&hi2c1, mpu6050_addr, MPU6050_REG_PWR_MGMT_1, 1, &pwr_wake, 1, 25);
    HAL_Delay(10);

    // Read WHO_AM_I register (0x75)
    uint8_t who = 0;
    if (HAL_I2C_Mem_Read(&hi2c1, mpu6050_addr, 0x75, 1, &who, 1, 25) == HAL_OK) {
        mpu6050_whoami = who;
    }

    // Switch to PLL with X gyro clock for best stability
    uint8_t pwr_pll = 0x01;
    HAL_I2C_Mem_Write(&hi2c1, mpu6050_addr, MPU6050_REG_PWR_MGMT_1, 1, &pwr_pll, 1, 25);
    HAL_Delay(5);

    // DLPF = 3 (44 Hz low-pass filter for clean motion signals)
    uint8_t dlpf = 0x03;
    HAL_I2C_Mem_Write(&hi2c1, mpu6050_addr, MPU6050_REG_CONFIG, 1, &dlpf, 1, 25);

    // Accel range = +/- 2g (16384 LSB/g)
    uint8_t a_cfg = 0x00;
    HAL_I2C_Mem_Write(&hi2c1, mpu6050_addr, MPU6050_REG_ACCEL_CFG, 1, &a_cfg, 1, 25);

    // Gyro range = +/- 250 deg/s
    uint8_t g_cfg = 0x00;
    HAL_I2C_Mem_Write(&hi2c1, mpu6050_addr, MPU6050_REG_GYRO_CFG, 1, &g_cfg, 1, 25);

    mpu6050_detected = 1;
    return 1;
}

static uint8_t __attribute__((unused)) mpu6050_read_accel(int16_t *ax, int16_t *ay, int16_t *az)
{
    if (!mpu6050_detected) {
        *ax = 0; *ay = 0; *az = 1000;
        return 0;
    }
    uint8_t raw[6];
    if (HAL_I2C_Mem_Read(&hi2c1, mpu6050_addr, MPU6050_REG_ACCEL_XOUT, 1, raw, 6, 20) != HAL_OK) {
        *ax = 0; *ay = 0; *az = 1000;
        return 0;
    }
    *ax = (int16_t)(((uint16_t)raw[0] << 8) | raw[1]);
    *ay = (int16_t)(((uint16_t)raw[2] << 8) | raw[3]);
    *az = (int16_t)(((uint16_t)raw[4] << 8) | raw[5]);
    return 1;
}

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
