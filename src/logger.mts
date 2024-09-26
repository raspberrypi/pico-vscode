/* eslint-disable @typescript-eslint/no-unused-vars */
type LogLevel = "debug" | "info" | "warn" | "error";

const logLevel: LogLevel =
  process.env.BUILD === "production" ? "warn" : "debug";

// ANSI escape codes for colored console output
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const magenta = "\x1b[35m";
// ANSI escape code to reset color
const reset = "\x1b[0m";

const EXT_LOG_PREFIX = "raspberry-pi-pico";

/**
 * Interface for objects that can be converted to a string with the toString() method.
 */
interface Stringable {
  toString(): string;
}

/**
 * Log source identifiers for functions that aren't
 * part of a class and therefore don't have a class name.
 * Current convention is to use the file name.
 *
 * @enum {string}
 */
export enum LoggerSource {
  githubRestApi = "githubREST",
  gitDownloader = "downloadGit",
  downloader = "download",
  requirements = "requirementsUtil",
  examples = "examplesUtil",
  githubApiCache = "githubApiCache",
  extension = "extension",
  cmake = "cmakeUtil",
  downloadHelper = "downloadHelper",
  pythonHelper = "pythonHelper",
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
    console.log(`[${EXT_LOG_PREFIX}] ${message}`, ...optionalParams);
  }

  private static shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];

    return levels.indexOf(level) >= levels.indexOf(logLevel);
  }

  public info(message: string, ...optionalParams: Stringable[]): void {
    Logger.info(this.className, message, ...optionalParams);
  }

  public static info(
    source: string | LoggerSource,
    message: string,
    ...optionalParams: Stringable[]
  ): void {
    if (Logger.shouldLog("info")) {
      console.info(
        `[${blue}INFO${reset}] [${EXT_LOG_PREFIX} - ${source}] ${message}`,
        ...optionalParams
      );
    }
  }

  public warn(message: string, ...optionalParams: Stringable[]): void {
    Logger.warn(this.className, message, ...optionalParams);
  }

  public static warn(
    source: string | LoggerSource,
    message: string,
    ...optionalParams: Stringable[]
  ): void {
    if (Logger.shouldLog("warn")) {
      console.warn(
        `[${yellow}WARN${reset}] [${EXT_LOG_PREFIX} - ${source}] ${message}`,
        ...optionalParams
      );
    }
  }

  public error(message: string | Error, ...optionalParams: Stringable[]): void {
    Logger.error(this.className, message, ...optionalParams);
  }

  public static error(
    source: string | LoggerSource,
    message: string | Error,
    ...optionalParams: Stringable[]
  ): void {
    if (Logger.shouldLog("error")) {
      if (message instanceof Error) {
        message = message.message;
      }

      console.error(
        `[${red}ERROR${reset}] [${EXT_LOG_PREFIX} - ${source}] ${message}`,
        ...optionalParams
      );
    }
  }

  public debug(message: string, ...optionalParams: Stringable[]): void {
    Logger.debug(this.className, message, ...optionalParams);
  }

  public static debug(
    source: string | LoggerSource,
    message: string,
    ...optionalParams: Stringable[]
  ): void {
    if (this.shouldLog("debug")) {
      console.debug(
        `[${magenta}DEBUG${reset}] [${EXT_LOG_PREFIX} - ${source}] ${message}`,
        ...optionalParams
      );
    }
  }
}
