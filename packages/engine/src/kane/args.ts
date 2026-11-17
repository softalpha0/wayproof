// Builds the kane-cli command as a list of separate arguments (FR-21, TDD.md §13.1, §16).
// The list is passed to the process directly, never joined into a shell string,
// so text inside an objective can never become an extra command.

export interface KaneRunSpec {
  /** Plain-English objective for Kane. */
  objective: string;
  /** Start URL (https only). */
  url: string;
  /** Passed to Kane's --timeout. Day-0 showed Kane may not stop on it, so runKane also has its own stopwatch. */
  timeoutSeconds: number;
  /** Passed to Kane's --max-steps (Kane's default is 50). */
  maxSteps: number;
}

export class InvalidKaneSpecError extends Error {
  override name = "InvalidKaneSpecError";
}

export function buildKaneArgs(spec: KaneRunSpec): string[] {
  const objective = spec.objective.trim();
  if (objective.length === 0) {
    throw new InvalidKaneSpecError("The Kane objective is empty.");
  }

  let parsed: URL;
  try {
    parsed = new URL(spec.url);
  } catch {
    throw new InvalidKaneSpecError(`The start URL is not a valid web address: ${spec.url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidKaneSpecError(`The start URL must start with https:// — got ${spec.url}`);
  }

  if (!Number.isInteger(spec.timeoutSeconds) || spec.timeoutSeconds <= 0) {
    throw new InvalidKaneSpecError(`timeoutSeconds must be a whole number above 0 — got ${spec.timeoutSeconds}`);
  }
  if (!Number.isInteger(spec.maxSteps) || spec.maxSteps <= 0) {
    throw new InvalidKaneSpecError(`maxSteps must be a whole number above 0 — got ${spec.maxSteps}`);
  }

  return [
    "run",
    objective,
    "--url",
    parsed.href,
    "--agent",
    "--headless",
    "--timeout",
    String(spec.timeoutSeconds),
    "--max-steps",
    String(spec.maxSteps),
  ];
}
