export type DepId =
  | "pico-sdk"
  | "arm-toolchain"
  | "riscv-toolchain"
  | "ninja"
  | "cmake"
  | "embedded-python" // windows-only
  | "git" // windows-only
  | "openocd"
  | "7zip" // windows-only
  | "pico-sdk-tools"
  | "picotool"
  | "zephyr";

export interface DependencyMeta {
  id: DepId;
  label: string;
  platforms?: NodeJS.Platform[]; // omit = all
  versioned?: boolean; // default true
}

export const ALL_DEPS: DependencyMeta[] = [
  { id: "pico-sdk", label: "Pico SDK" },
  { id: "arm-toolchain", label: "Arm GNU Toolchain" },
  { id: "riscv-toolchain", label: "RISC-V GNU Toolchain" },
  { id: "ninja", label: "Ninja" },
  { id: "cmake", label: "CMake" },
  { id: "embedded-python", label: "Embedded Python", platforms: ["win32"] },
  { id: "git", label: "Git", platforms: ["win32"] },
  { id: "openocd", label: "OpenOCD" },
  { id: "7zip", label: "7-Zip", platforms: ["win32"], versioned: false },
  { id: "pico-sdk-tools", label: "Pico SDK Tools" },
  { id: "picotool", label: "Picotool" },
];
