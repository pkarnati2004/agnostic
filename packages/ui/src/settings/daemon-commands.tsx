import { CopyButton } from "./copy-button";
import { SettingsBox, SettingsBoxRow } from "./settings-box";
import { SettingsGroupHeading } from "./settings-row";

/** Each line, with the words the CLI's own `--help` gives it. The page runs none of them. */
const COMMANDS: { command: string; description: string }[] = [
  { command: "agn daemon start", description: "start the daemon" },
  { command: "agn daemon stop", description: "stop the daemon" },
  { command: "agn daemon restart", description: "stop the daemon and start it again" },
  {
    command: "agn daemon status",
    description:
      "report whether the daemon is running (exit 0 running, 1 stopped, 2 stale or foreign)",
  },
  { command: "agn doctor", description: "detect installed agents, logins and models" },
  { command: "agn catalog update", description: "fetch the latest published catalog" },
  {
    command: "agn hooks install --repo <path>",
    description: "install agn's status hook for a repo's harnesses",
  },
];

/**
 * There is no Restart button: the page cannot restart the daemon that serves it and then hear the
 * answer, so it gives the reader the line to run instead.
 */
export function DaemonCommands({ file }: { file: string | null }) {
  return (
    <>
      <SettingsGroupHeading
        title="Commands"
        description="Run these in a terminal. Each button copies the line."
      />
      <SettingsBox>
        {COMMANDS.map((row) => (
          <SettingsBoxRow key={row.command}>
            <span className="shrink-0 type-mono">{row.command}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground type-meta">
              {row.description}
            </span>
            <CopyButton text={row.command} label={`Copy ${row.command}`} />
          </SettingsBoxRow>
        ))}
        <SettingsBoxRow>
          <span className="shrink-0">config.yaml</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground type-mono">
            {file ?? ""}
          </span>
          <CopyButton text={file} label="Copy the path of config.yaml" />
        </SettingsBoxRow>
      </SettingsBox>
    </>
  );
}
