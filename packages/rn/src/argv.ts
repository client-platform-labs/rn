const CORE_ROOT_COMMANDS = new Set([
  "doctor",
  "init",
  "dev",
  "plugin",
  "config",
  "preflight",
  "self",
]);

export function firstPositional(argv: string[]): string | undefined {
  for (const arg of argv.slice(2)) {
    if (arg === "--") {
      break;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    return arg;
  }
  return undefined;
}

export function shouldLoadPluginCommands(argv: string[]): boolean {
  const command = firstPositional(argv);
  if (command === undefined) {
    return true;
  }
  return !CORE_ROOT_COMMANDS.has(command);
}
