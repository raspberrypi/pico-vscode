export enum BoardType {
  pico = "pico",
  picoW = "pico_w",
  pico2 = "pico2",
  pico2W = "pico2_w",
  other = "other",
}

export enum ZephyrProjectBase {
  simple = "simple",
  blinky = "blinky",
  wifi = "wifi",
}

export interface ZephyrSubmitMessageValue {
  projectName: string;
  pythonMode: number;
  pythonPath: string;
  console: string;
  boardType: BoardType;
  spiFeature: boolean;
  i2cFeature: boolean;
  gpioFeature: boolean;
  wifiFeature: boolean;
  sensorFeature: boolean;
  shellFeature: boolean;
  posixFeature: boolean;
  jsonFeature: boolean;
  debugFeature: boolean;
  cmakeMode: number;
  cmakePath: string;
  cmakeVersion: string;
  projectBase: ZephyrProjectBase;
  ninjaMode: number;
  ninjaPath: string;
  ninjaVersion: string;
}

export interface ImportProjectMessageValue {
  selectedSDK: string;
  selectedToolchain: string;
  selectedPicotool: string;
  ninjaMode: number;
  ninjaPath: string;
  ninjaVersion: string;
  cmakeMode: number;
  cmakePath: string;
  cmakeVersion: string;

  // debugger
  debugger: number;
  useCmakeTools: boolean;
}

export interface SubmitExampleMessageValue extends ImportProjectMessageValue {
  example: string;
  boardType: string;
}

export interface SubmitMessageValue extends ImportProjectMessageValue {
  projectName: string;
  boardType: string;

  // features (libraries)
  spiFeature: boolean;
  pioFeature: boolean;
  i2cFeature: boolean;
  dmaFeature: boolean;
  hwwatchdogFeature: boolean;
  hwclocksFeature: boolean;
  hwinterpolationFeature: boolean;
  hwtimerFeature: boolean;

  // stdio support
  uartStdioSupport: boolean;
  usbStdioSupport: boolean;

  // pico wireless options
  picoWireless: number;

  // code generation options
  addUartExample: boolean;
  runFromRAM: boolean;
  entryPointProjectName: boolean;
  cpp: boolean;
  cppRtti: boolean;
  cppExceptions: boolean;
}

export interface WebviewMessage {
  command: string;
  value: object | string | SubmitMessageValue | boolean;
  key?: string;
}

export type DependencyItem = {
  id: string;
  depId: string;
  label: string;
  version: string;
  installedAt: string;
  lastUsed: string;
  path?: string;
};
