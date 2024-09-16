/**
 * Interface for testable classes.
 *
 * Requires a class to have a test method that will include a prefedined set of
 * inputs to test .
 *
 * TODO: make default for all commands
 */
export default interface Testable {
  test(): void;
}
