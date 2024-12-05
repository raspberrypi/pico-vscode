// This file contains a swift wrapper for some Pico SDK C style stuff
// Upercase library names can be used to only include helpers for available APIs

#if PICO_STDLIB
public struct PicoGPIO {
    /// Enum for GPIO direction, mirroring the C enum
    public enum Direction: UInt8 {
        case input = 0
        case output = 1
    }

    /// Swift-friendly wrapper for gpio_set_dir
    public static func setDirection(pin: UInt32, direction: Direction) {
        gpio_set_dir(pin, direction.rawValue != 0)
    }
}
#endif
