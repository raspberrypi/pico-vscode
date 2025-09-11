export default class State {
  private static instance?: State;
  public isRustProject = false;

  public constructor() {}

  public static getInstance(): State {
    if (!State.instance) {
      this.instance = new State();
    }

    return this.instance!;
  }
}
