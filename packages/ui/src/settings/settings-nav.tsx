import { Search } from "lucide-react";
import { cn } from "../class-names";
import { CopyButton } from "./copy-button";
import type { SettingsSection, SettingsSectionId } from "./settings-sections";

type SettingsNavProps = {
  /** Already filtered by the query: the dialog owns the filter, the nav draws the result. */
  sections: SettingsSection[];
  active: SettingsSectionId;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (id: SettingsSectionId) => void;
  /** The path of config.yaml, or null until `GET /config` answers. */
  file: string | null;
};

/** The left pane: what to search in, what there is, and where the answers are written down. */
export function SettingsNav(props: SettingsNavProps) {
  const groups = [...new Set(props.sections.map((section) => section.group))];
  return (
    <div className="flex w-[248px] shrink-0 flex-col border-sidebar-border border-r bg-sidebar">
      <div className="px-3 pt-3.5 pb-1.5">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-input bg-background px-2.5">
          <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={props.query}
            onChange={(change) => props.onQuery(change.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <nav
        aria-label="Settings sections"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3"
      >
        {groups.map((group) => (
          <div key={group} className="flex flex-col">
            <span
              id={`settings-group-${group}`}
              className="px-2.5 pt-4 pb-1.5 text-muted-foreground type-meta"
            >
              {group}
            </span>
            <ul aria-labelledby={`settings-group-${group}`} className="flex flex-col">
              {props.sections
                .filter((section) => section.group === group)
                .map((section) => (
                  <li key={section.id} className="flex flex-col">
                    <NavRow
                      section={section}
                      active={section.id === props.active}
                      onSelect={props.onSelect}
                    />
                  </li>
                ))}
            </ul>
          </div>
        ))}
        {props.sections.length === 0 && (
          <p className="px-2.5 pt-4 text-muted-foreground type-meta">No settings match</p>
        )}
      </nav>
      <div className="border-sidebar-border border-t px-3 py-2.5">
        <ConfigFileRow file={props.file} />
      </div>
    </div>
  );
}

function NavRow({
  section,
  active,
  onSelect,
}: {
  section: SettingsSection;
  active: boolean;
  onSelect: (id: SettingsSectionId) => void;
}) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(section.id)}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent",
      )}
    >
      <Icon aria-hidden className="size-[15px] shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{section.label}</span>
    </button>
  );
}

/** Where every change lands. Copy rather than open: the page has no way to run an editor here. */
function ConfigFileRow({ file }: { file: string | null }) {
  return (
    <div className="flex h-8 items-center gap-2 px-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-meta">config.yaml</span>
        <span className="truncate text-[11px] text-muted-foreground" title={file ?? undefined}>
          {file ?? ""}
        </span>
      </span>
      <CopyButton text={file} label="Copy the path of config.yaml" />
    </div>
  );
}
