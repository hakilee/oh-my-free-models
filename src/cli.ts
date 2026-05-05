#!/usr/bin/env node
import { runModelCommand } from './commands/model.js';
import { runStartCommand } from './commands/start.js';
import { runStopCommand } from './commands/stop.js';
import { printStatus } from './commands/status.js';
import { printDoctorStatus } from './commands/doctor.js';
import { runUsageCommand } from './commands/usage.js';

interface ParsedArgs {
  command: string;
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=', 2);
      if (inline !== undefined) flags.set(name!, inline);
      else if (rest[i + 1] && !rest[i + 1]!.startsWith('-')) flags.set(name!, rest[++i]!);
      else flags.set(name!, true);
    }
  }
  return { command, flags };
}

function parsePort(value: string | boolean | undefined): number | undefined {
  if (value === undefined || value === false) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${String(value)}`);
  }
  return port;
}

function help(): void {
  console.log(`oh-my-free-models 0.0.1\n\nUsage:\n  omfm model [--all] [--select id1,id2] [--group fast|balanced|capable] [--best] [--json]\n  omfm start [--port 4567] [--daemon]\n  omfm stop\n  omfm status\n  omfm usage [--json]\n  omfm doctor\n\nEnvironment:\n  OPENROUTER_API_KEY and NVIDIA_API_KEY are read from the process first, then ~/.oh-my-free-models/.env\n`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
    help();
    return;
  }
  if (parsed.command === 'model') {
    const selectFlag = parsed.flags.get('select');
    const groupFlag = parsed.flags.get('group');
    await runModelCommand({
      all: parsed.flags.has('all'),
      json: parsed.flags.has('json'),
      best: parsed.flags.has('best'),
      group: typeof groupFlag === 'string' ? groupFlag : undefined,
      select: typeof selectFlag === 'string' ? selectFlag.split(',').map((x) => x.trim()).filter(Boolean) : undefined,
    });
    return;
  }
  if (parsed.command === 'start') {
    const portFlag = parsed.flags.get('port');
    await runStartCommand({
      port: parsePort(portFlag),
      daemon: parsed.flags.has('daemon'),
      daemonChild: parsed.flags.has('daemon-child'),
    });
    return;
  }
  if (parsed.command === 'stop') {
    runStopCommand();
    return;
  }
  if (parsed.command === 'status') {
    printStatus();
    return;
  }
  if (parsed.command === 'usage') {
    runUsageCommand({ json: parsed.flags.has('json') });
    return;
  }
  if (parsed.command === 'doctor') {
    printDoctorStatus();
    return;
  }
  help();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
