import type { ReactNode } from "react";

/** A setting this dialog does not own: it lives in the repo's own files, and the line says where. */
export function PerRepoLine({ children }: { children: ReactNode }) {
  return <p className="mt-2.5 text-[12px] text-muted-foreground">{children}</p>;
}
