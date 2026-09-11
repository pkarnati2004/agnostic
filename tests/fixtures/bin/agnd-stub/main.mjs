#!/usr/bin/env node
// Stands in for the daemon bin: echoes the arguments agn passed and exits with AGND_STUB_EXIT.
process.stdout.write(`agnd-stub ${process.argv.slice(2).join(" ")}\n`);
if (process.env.AGND_STUB_STDERR !== undefined) {
  process.stderr.write(`${process.env.AGND_STUB_STDERR}\n`);
}
process.exit(Number(process.env.AGND_STUB_EXIT ?? "0"));
