import { spawn } from 'child_process';
import EventEmitter from 'events';

/*
interface AdvancedDecoder {
  init(
    config: SWOAdvancedDecoderConfig,
    outputData: (output: string) => void,
    graphData: (data: number, id: string) => void
  ): void;
  typeName(): string;
  outputLabel(): string;
  softwareEvent(port: number, data: Buffer): void;
  synchronized(): void;
  lostSynchronization(): void;
}*/

class DefmtDecoder extends EventEmitter {
  constructor() {
    this.process = null;
    this.elfPath = null;
    this.displayOutput = null;
    this.graphData = null;
  }

  init(config, displayOutput, graphData) {
    // Store the callbacks and elfPath from the config
    this.elfPath = config.config.elfPath;
    this.displayOutput = displayOutput;
    this.graphData = graphData;

    const defmtPrintPath = `${process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME}/.cargo/bin/defmt-print${process.platform === "win32" ? ".exe" : ""}`;

    // Spawn the defmt-print process with the provided ELF path
    this.process = spawn(defmtPrintPath, ['-e', this.elfPath, "stdin"]);

    // Handle data from defmt-print stdout and relay it to the displayOutput callback
    this.process.stdout.on('data', (data) => {
      if (this.displayOutput) {
        this.displayOutput(data.toString());
      }
    });

    // Handle errors from defmt-print stderr
    this.process.stderr.on('data', (data) => {
      if (this.displayOutput) {
        //this.displayOutput(`Error: ${data.toString()}`);
        this.displayOutput(data.toString());
      }
    });

    // Handle when the process closes
    this.process.on('close', (code) => {
      if (this.displayOutput) {
        this.displayOutput(`Decoding process exited with code: ${code}`);
      }
    });
  }

  //sendData(input: Buffer): void;
  sendData(input) {
    // Write input data to defmt-print's stdin
    try {
      if (this.process && this.process.stdin.writable) {
        this.process.stdin.write(input);
        return;
      }
    } catch { }

    throw new Error('Process stdin is not writable.');
  }

  // Expected methods from the SWODecoder API conforming to the AdvancedDecoder interface

  //typeName(): string;
  typeName() {
    return 'DefmtDecoder';
  }

  //outputLabel(): string;
  outputLabel() {
    return 'RPi Pico';
  }

  //softwareEvent(port: number, data: Buffer): void;
  softwareEvent(port, data) {
    if (this.ports.indexOf(port) !== -1) {
      // Handle the software event, potentially by sending data to defmt-print stdin
      this.sendData(data);
    }
  }

  //synchronized(): void;
  synchronized() {
    // Handle the synchronized event
    if (this.displayOutput) {
      this.displayOutput('Synchronized');
    }
  }

  //lostSynchronization(): void;
  lostSynchronization() {
    // Handle the lost synchronization event
    if (this.displayOutput) {
      this.displayOutput('Lost synchronization');
    }
  }

  // own dispose method

  dispose() {
    // Clean up the process
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.emit('dispose');
  }
}

export default DefmtDecoder;
