/* eslint-disable @typescript-eslint/no-unused-vars */
type LogLevel = "debug" | "info" | "warn" | "error";

const logLevel: LogLevel = process.env.BUILD ? "warn" : "debug";

// ANSI escape codes for colored console output
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const magenta = "\x1b[35m";
// ANSI escape code to reset color
const reset = "\x1b[0m";

/**
 * Interface for objects that can be converted to a string with the toString() method.
 */
interface Stringable {
  toString(): string;
}

/**
 * Logger class to log messages to the console with different log levels and identifiable source.
 */
export default class Logger {
  private className: string;

  /**
   * Creates a new Logger instance.
   *
   * @param className The name of the class the logger is used in.
   */
  constructor(className: string) {
    this.className = className;
  }

  /**
   * Logs the given message to the console.
   *
   * @param message The message to log.
   * @param optionalParams Optional parameters to log.
   */
  public static log(
    message: string | undefined,
    ...optionalParams: Stringable[]
  ): void {
    console.log(`[raspberry-pi-pico] ${message}`, ...optionalParams);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];

    return levels.indexOf(level) >= levels.indexOf(logLevel);
  }

  public info(message: string, ...optionalParams: Stringable[]): void {
    if (this.shouldLog("info")) {
      console.info(`[INFO] [${this.className}] ${message}`, ...optionalParams);
    }
  }

  public warn(message: string, ...optionalParams: Stringable[]): void {
    if (this.shouldLog("warn")) {
      console.warn(
        `[${yellow}WARN${reset}] [${this.className}] ${message}`,
        ...optionalParams
      );
    }
  }

  public error(message: string | Error, ...optionalParams: Stringable[]): void {
    if (this.shouldLog("error")) {
      if (message instanceof Error) {
        message = message.message;
      }

      console.error(
        `[${red}ERROR${reset}] [${this.className}] ${message}`,
        ...optionalParams
      );
    }
  }

  public debug(message: string, ...optionalParams: Stringable[]): void {
    if (this.shouldLog("debug")) {
      console.debug(
        `[DEBUG] [${this.className}] ${message}`,
        ...optionalParams
      );
    }
  }
}
