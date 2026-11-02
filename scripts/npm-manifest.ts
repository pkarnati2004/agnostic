export type WorkspaceManifest = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  type?: string;
  bin?: Record<string, string>;
  files?: string[];
  engines?: Record<string, string>;
  keywords?: string[];
  repository?: unknown;
  homepage?: string;
  bugs?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: unknown;
  private?: boolean;
  scripts?: Record<string, string>;
};

export type PublishedManifest = Omit<
  WorkspaceManifest,
  "exports" | "private" | "scripts" | "devDependencies" | "dependencies"
> & {
  dependencies: Record<string, string>;
};

/** The packages esbuild leaves out of the bundle: native, so npm has to install them. */
export const NATIVE_DEPENDENCIES = ["better-sqlite3", "node-pty"] as const;

/** The optional native accelerators ws loads inside try/catch; left out of the bundle and of the manifest. */
export const OPTIONAL_EXTERNALS = ["bufferutil", "utf-8-validate"] as const;

const REQUIRED_FIELDS = ["bin", "version", "license", "engines", "files"] as const;

export function nativePins(
  manifests: { name: string; dependencies?: Record<string, string> }[],
): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const dependency of NATIVE_DEPENDENCIES) {
    const declared = manifests.flatMap((manifest) => {
      const version = manifest.dependencies?.[dependency];
      return version === undefined ? [] : [{ from: manifest.name, version }];
    });
    const [first] = declared;
    if (first === undefined) {
      throw new Error(`no workspace package declares ${dependency}`);
    }
    const other = declared.find((entry) => entry.version !== first.version);
    if (other !== undefined) {
      throw new Error(
        `${dependency} is pinned to ${first.version} in ${first.from} and ${other.version} in ${other.from}`,
      );
    }
    pins[dependency] = first.version;
  }
  return pins;
}

export function publishedManifest(
  workspace: WorkspaceManifest,
  pins: Record<string, string>,
): PublishedManifest {
  for (const field of REQUIRED_FIELDS) {
    if (workspace[field] === undefined) {
      throw new Error(`${workspace.name}'s package.json has no "${field}"; npm needs it`);
    }
  }
  for (const [name, version] of Object.entries(pins)) {
    if (version.startsWith("workspace:")) {
      throw new Error(`${name} is "${version}", which no registry resolves`);
    }
  }
  const {
    exports: _exports,
    private: _private,
    scripts: _scripts,
    devDependencies: _devDependencies,
    dependencies: _dependencies,
    ...published
  } = workspace;
  return { ...published, dependencies: { ...pins } };
}
