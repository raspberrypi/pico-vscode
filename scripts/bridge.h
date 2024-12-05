#pragma once

#ifndef PICO_DEFAULT_LED_PIN
#define PICO_DEFAULT_LED_PIN 6
#endif

#ifdef _HARDWARE_STRUCTS_SPI_H
#ifdef spi0
spi_inst_t* get_spi0(void) {
    return spi0;
}
#endif

#ifdef spi1
spi_inst_t* get_spi1(void) {
    return spi1;
}
#endif
#endif

#ifdef _HARDWARE_STRUCTS_I2C_H
#ifdef i2c0
i2c_inst_t* get_i2c0(void) {
    return i2c0;
}
#endif

#ifdef i2c1
i2c_inst_t* get_i2c1(void) {
    return i2c1;
}
#endif
#endif

#ifdef _HARDWARE_STRUCTS_PIO_H 
#ifdef pio0
pio_hw_t* get_pio0(void) {
    return pio0;
}
#endif

#ifdef pio1
pio_hw_t* get_pio1(void) {
    return pio1;
}
#endif

#ifdef pio2
pio_hw_t* get_pio2(void) {
    return pio2;
}
#endif
#endif

/**
 * @file bridge.h
 * @brief Simplifies the usage of specific SDK features in Swift by providing wrapper functions.
 * 
 * This header acts as a bridge between C and Swift, exposing certain features of the Pico SDK 
 * in a simplified manner. For example it includes helper functions for accessing predefined 
 * UART instances (`uart0` and `uart1`), making them easily callable from Swift.
 */

#ifdef _HARDWARE_STRUCTS_UART_H // Ensure that UART hardware structs are included before compiling

#ifdef uart0
/**
 * @brief Retrieves the instance for UART0.
 * 
 * This function provides access to the pre-defined `uart0` instance, 
 * allowing straightforward interaction with the UART hardware from Swift.
 * 
 * @return Pointer to the `uart0` instance.
 */
uart_inst_t* get_uart0(void) {
    return uart0;
}
#endif

#ifdef uart1
/**
 * @brief Retrieves the instance for UART1.
 * 
 * This function provides access to the pre-defined `uart1` instance, 
 * allowing straightforward interaction with the UART hardware from Swift.
 * 
 * @return Pointer to the `uart1` instance.
 */
uart_inst_t* get_uart1(void) {
    return uart1;
}
#endif

#endif
