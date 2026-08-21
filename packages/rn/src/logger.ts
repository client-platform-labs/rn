import type { Logger } from "@client-platform/rn-core";

export interface CliLogger extends Logger {
  json: boolean;
  nonInteractive: boolean;
  writeMachine(payload: unknown): void;
  writeHuman(message: string): void;
}

export function isCi(value: string | undefined = process.env.CI): boolean {
  if (value === undefined || value === "") {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized !== "0" && normalized !== "false";
}

export function resolveRuntimeFlags(opts: {
  json?: boolean;
  nonInteractive?: boolean;
}): { json: boolean; nonInteractive: boolean } {
  const json = Boolean(opts.json);
  const nonInteractive = json || Boolean(opts.nonInteractive) || isCi();
  return { json, nonInteractive };
}

export function createLogger(options: {
  json: boolean;
  nonInteractive: boolean;
}): CliLogger {
  return {
    json: options.json,
    nonInteractive: options.nonInteractive,
    info(message: string) {
      console.error(message);
    },
    warn(message: string) {
      console.error(`warning: ${message}`);
    },
    writeMachine(payload: unknown) {
      console.log(JSON.stringify(payload, null, 2));
    },
    writeHuman(message: string) {
      if (options.json) {
        console.error(message);
      } else {
        console.log(message);
      }
    },
  };
}

export function peekArgvFlags(argv: string[]): {
  json: boolean;
  nonInteractive: boolean;
} {
  return {
    json: argv.includes("--json"),
    nonInteractive: argv.includes("--non-interactive"),
  };
}
