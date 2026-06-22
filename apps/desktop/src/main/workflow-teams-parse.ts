export type CveVulnerability = {
  dependency: string;
  version?: string;
  advisory?: string;
  severity?: string;
  action?: string;
};

export type TeamsReport =
  | {
      kind: "cve_scan";
      summary: string;
      vulnerabilities: CveVulnerability[];
    }
  | {
      kind: "bug_triage";
      summary: string;
      findings: string[];
      suggestedNextSteps: string[];
    };

export function extractTeamsJsonBlock(text: string): string | null {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
  if (fenced.length > 0) {
    return fenced[fenced.length - 1]![1]!.trim();
  }
  const braceMatch = text.match(/\{[\s\S]*"summary"[\s\S]*\}/);
  return braceMatch ? braceMatch[0]!.trim() : null;
}

export function parseTeamsReport(text: string, fallbackKind: TeamsReport["kind"]): TeamsReport {
  const jsonText = extractTeamsJsonBlock(text);
  if (!jsonText) {
    return fallbackKind === "cve_scan"
      ? { kind: "cve_scan", summary: text.trim().slice(0, 500) || "Scan complete.", vulnerabilities: [] }
      : {
          kind: "bug_triage",
          summary: text.trim().slice(0, 500) || "Investigation complete.",
          findings: [],
          suggestedNextSteps: [],
        };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return fallbackKind === "cve_scan"
      ? { kind: "cve_scan", summary: text.trim().slice(0, 500), vulnerabilities: [] }
      : {
          kind: "bug_triage",
          summary: text.trim().slice(0, 500),
          findings: [],
          suggestedNextSteps: [],
        };
  }

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "Workflow complete.";

  if (fallbackKind === "cve_scan" || Array.isArray(parsed.vulnerabilities)) {
    const vulnerabilities = (Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [])
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as Record<string, unknown>;
        const dependency = typeof item.dependency === "string" ? item.dependency : null;
        if (!dependency) return null;
        return {
          dependency,
          version: typeof item.version === "string" ? item.version : undefined,
          advisory:
            typeof item.advisory === "string"
              ? item.advisory
              : typeof item.cve === "string"
                ? item.cve
                : undefined,
          severity: typeof item.severity === "string" ? item.severity : undefined,
          action: typeof item.action === "string" ? item.action : undefined,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return {
      kind: "cve_scan",
      summary,
      vulnerabilities: vulnerabilities as CveVulnerability[],
    };
  }

  const findings = (Array.isArray(parsed.findings) ? parsed.findings : [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const suggestedNextSteps = (
    Array.isArray(parsed.suggestedNextSteps) ? parsed.suggestedNextSteps : []
  )
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  return { kind: "bug_triage", summary, findings, suggestedNextSteps };
}
