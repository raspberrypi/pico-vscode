#pragma once

/**
 * @file bridge.h
 * @brief Simplifies the usage of specific SDK features in Swift by providing wrapper functions.
 * 
 * This header acts as a bridge between C and Swift, exposing certain features of the Pico SDK 
 * in a simplified manner. For example it includes helper functions for accessing predefined 
 * UART instances (`uart0` and `uart1`), making them easily callable from Swift.
 */

#ifdef _HARDWARE_STRUCTS_UART_H // Ensure that UART hardware structs are included before compiling

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
