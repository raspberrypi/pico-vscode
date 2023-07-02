/* eslint-disable @typescript-eslint/no-unused-vars */
type LogLevel = "debug" | "info" | "warn" | "error";

const logLevel: LogLevel = process.env.BUILD ? "warn" : "debug";

// ANSI escape code for red color
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const magenta = "\x1b[35m";
// ANSI escape code to reset color
const reset = "\x1b[0m";

interface Stringable {
  toString(): string;
}

export default class Logger {
  private className: string;

  constructor(className: string) {
    this.className = className;
  }

  static log(message: string): void {
    console.log(`[raspberry-pi-pico] ${message}`);
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
