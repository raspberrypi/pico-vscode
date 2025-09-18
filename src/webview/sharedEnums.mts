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
  cmakeMode: number;
  cmakePath: string;
  cmakeVersion: string;
  projectBase: ZephyrProjectBase;
}
