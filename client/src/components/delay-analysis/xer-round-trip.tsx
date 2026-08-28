import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Download,
  FileUp,
  Layers,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { GlassCard, SectionHeader } from "./ui/premium-components";
import {
  useRunXerNullTest,
  useUploadXer,
  useXerUploads,
  xerDownloadUrl,
  xerVerificationRecordUrl,
  type XerRun,
  type XerStructuralSide,
} from "@/lib/xer-api";

const categoryNames: Record<string, string> = {
  table_presence: "Table presence",
  table_order: "Table order",
  field_list: "Field lists",
  field_order: "Field order",
  row_count: "Row counts",
  row_value: "Cell values",
  row_order: "Row order",
  duplicate_identity: "Duplicate identity keys",
  row_identity_skipped: "Row identity analysis skipped",
  file_encoding: "Encoding",
  line_ending: "Line endings",
};

type CategoryTone = "ordering" | "mismatch" | "caution" | "neutral";

const categoryTone: Record<string, CategoryTone> = {
  table_presence: "mismatch",
  table_order: "ordering",
  field_list: "mismatch",
  field_order: "ordering",
  row_count: "mismatch",
  row_value: "mismatch",
  row_order: "ordering",
  duplicate_identity: "caution",
  row_identity_skipped: "neutral",
  file_encoding: "neutral",
  line_ending: "neutral",
};

const categoryToneStyles: Record<CategoryTone, string> = {
  ordering: "border-l-violet-500 bg-violet-500/[0.06] dark:bg-violet-500/[0.1]",
  mismatch: "border-l-rose-500 bg-rose-500/[0.06] dark:bg-rose-500/[0.1]",
  caution: "border-l-amber-500 bg-amber-500/[0.06] dark:bg-amber-500/[0.1]",
  neutral: "border-l-slate-400 bg-slate-500/[0.05] dark:bg-slate-400/[0.08]",
};

type Tone = "success" | "error" | "warning";

const toneStyles: Record<Tone, { banner: string; glow: string; iconWrap: string; badge: string }> = {
  success: {
    banner: "border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-400/5 to-transparent dark:from-emerald-500/20",
    glow: "from-emerald-400/30 via-emerald-300/10 to-transparent",
    iconWrap: "bg-emerald-500 text-white ring-4 ring-emerald-500/20 shadow-lg shadow-emerald-500/30",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  error: {
    banner: "border-rose-500/30 bg-gradient-to-br from-rose-500/15 via-rose-400/5 to-transparent dark:from-rose-500/20",
    glow: "from-rose-400/25 via-rose-300/10 to-transparent",
    iconWrap: "bg-rose-500 text-white ring-4 ring-rose-500/20 shadow-lg shadow-rose-500/30",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  warning: {
    banner: "border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent dark:from-amber-500/20",
    glow: "from-amber-400/25 via-amber-300/10 to-transparent",
    iconWrap: "bg-amber-500 text-white ring-4 ring-amber-500/20 shadow-lg shadow-amber-500/30",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
};

function structuralOneLiner(side: XerStructuralSide | null): string {
  if (!side || side.tableCount === null || !side.rowCountsByTable) return "not available";
  const totalRows = Object.values(side.rowCountsByTable).reduce((sum, count) => sum + count, 0);
  return `${side.tableCount.toLocaleString()} tables · ${totalRows.toLocaleString()} rows`;
}

function Disclosure({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: typeof ShieldCheck;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CopyableHash({ label, value }: { label: string; value: string | null }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">
          {value ?? "not available"}
        </code>
        {value && (
          <button
            type="button"
            onClick={copy}
            className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function StructuralChecklist({ label, side }: { label: string; side: XerStructuralSide | null }) {
  if (!side) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm text-muted-foreground">
        <div className="font-medium text-foreground">{label}</div>
        Not available — no output was produced for this run.
      </div>
    );
  }
  const tables = side.rowCountsByTable ? Object.entries(side.rowCountsByTable).sort(([a], [b]) => a.localeCompare(b)) : null;
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm space-y-2">
      <div className="font-medium">{label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Bytes</span><span className="font-mono text-foreground">{side.byteCount.toLocaleString()}</span>
        <span>Tables</span><span className="font-mono text-foreground">{side.tableCount ?? "unknown"}</span>
      </div>
      {tables && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border/60">
          <table className="w-full text-xs">
            <tbody>
              {tables.map(([tableName, rowCount]) => (
                <tr key={tableName} className="border-b border-border/40 last:border-b-0">
                  <td className="px-2 py-1 font-mono">{tableName}</td>
                  <td className="px-2 py-1 text-right font-mono">{rowCount.toLocaleString()} rows</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type StatusPresentation = { Icon: typeof CheckCircle2; label: string; plainLanguage: string; tone: Tone };

function presentStatus(run: XerRun): StatusPresentation {
  if (run.integrityStatus === "verified") {
    return {
      Icon: CheckCircle2,
      label: "Byte-identical — zero differences",
      plainLanguage: "This file was read and rewritten with zero changes — confirmed by comparing every byte.",
      tone: "success",
    };
  }
  if (run.outcome === "clean" && run.integrityStatus === "hash_mismatch") {
    return {
      Icon: XCircle,
      label: "Data integrity error — stored result could not be verified",
      plainLanguage: "This run's stored result conflicts with its own verification data, so it cannot be confirmed as a pass. Re-run the null test.",
      tone: "error",
    };
  }
  if (run.outcome === "clean" && run.integrityStatus === "incomplete_record") {
    return {
      Icon: AlertTriangle,
      label: "Incomplete record — re-run to generate verification data",
      plainLanguage: "This run predates independent verification, so there isn't enough evidence on file to confirm it as a pass. Re-run the null test to generate it.",
      tone: "warning",
    };
  }
  if (run.outcome === "stopped") {
    return {
      Icon: XCircle,
      label: "Stopped — file could not be parsed with confidence",
      plainLanguage: run.errorMessage ?? "The file could not be parsed with confidence, so no round trip was attempted.",
      tone: "error",
    };
  }
  if (run.outcome === "incomplete") {
    return {
      Icon: AlertTriangle,
      label: "Incomplete — ambiguous row identity found",
      plainLanguage: "The null test could not fully complete because a table's row identity was ambiguous — see the itemized findings below.",
      tone: "warning",
    };
  }
  return {
    Icon: AlertTriangle,
    label: "Differences found",
    plainLanguage: "The file changed when it was read and rewritten — see the itemized differences below.",
    tone: "warning",
  };
}

function formatRunTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One run, rendered as a self-contained accordion card. Collapsed, it shows only
 * a colored status strip with the run number and timestamp so multiple runs of
 * the same upload never blur together. Expanded, it reveals the full result.
 */
function RunHistoryItem({
  projectId,
  run,
  runNumber,
  totalRuns,
  defaultOpen,
}: {
  projectId: string;
  run: XerRun;
  runNumber: number;
  totalRuns: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const groups = useMemo(() => {
    const result: Record<string, NonNullable<XerRun["diffReport"]>["differences"]> = {};
    for (const difference of run.diffReport?.differences ?? []) {
      (result[difference.category] ??= []).push(difference);
    }
    return result;
  }, [run.diffReport]);
  const status = presentStatus(run);
  const tone = toneStyles[status.tone];
  const isSuccess = status.tone === "success";
  const StatusIcon = status.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("relative overflow-hidden rounded-2xl border", tone.banner)}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))]", tone.glow)} />
      {isSuccess && open && (
        <Sparkles className="pointer-events-none absolute right-6 top-6 h-6 w-6 text-emerald-400/60" />
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative z-10 flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            initial={isSuccess && defaultOpen ? { scale: 0.5, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.55, duration: 0.6 }}
            className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", tone.iconWrap)}
          >
            <StatusIcon className="h-5 w-5" />
          </motion.div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold tracking-tight">{status.label}</span>
              {runNumber === totalRuns && (
                <Badge className="border-0 bg-primary text-[10px] uppercase tracking-wide text-primary-foreground">Latest</Badge>
              )}
              <Badge variant="outline" className={cn("font-mono text-[11px]", tone.badge)}>
                ERMHDR {run.detectedVersion ?? "not detected"}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Run {runNumber} of {totalRuns} · {formatRunTimestamp(run.createdAt)}
            </div>
          </div>
        </div>
        <ChevronDown className={cn("h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4">
              <p className="text-sm text-foreground/80 max-w-xl">{status.plainLanguage}</p>
              {run.outcome === "stopped" && run.errorMessage && (
                <p className="text-sm text-destructive">{run.errorMessage}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {run.hasOutput && (
                  <Button variant="outline" size="sm" className="bg-background/70" asChild>
                    <a href={xerDownloadUrl(projectId, run.uploadId, run.id)}>
                      <Download className="mr-2 h-4 w-4" /> Download output
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="bg-background/70" asChild>
                  <a href={xerVerificationRecordUrl(projectId, run.uploadId, run.id)} download>
                    <ClipboardCheck className="mr-2 h-4 w-4" /> Verification record
                  </a>
                </Button>
              </div>

              {run.structuralSummary && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-background/60 px-3 py-2.5 text-sm backdrop-blur-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Original</span>
                    <div className="font-medium">{structuralOneLiner(run.structuralSummary.original)}</div>
                  </div>
                  <div className="rounded-lg bg-background/60 px-3 py-2.5 text-sm backdrop-blur-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Round-tripped output</span>
                    <div className="font-medium">{structuralOneLiner(run.structuralSummary.output)}</div>
                  </div>
                </div>
              )}

              <Disclosure title="Full structural breakdown by table" icon={Layers}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StructuralChecklist label="Original file" side={run.structuralSummary?.original ?? null} />
                  <StructuralChecklist label="Round-tripped output" side={run.structuralSummary?.output ?? null} />
                </div>
              </Disclosure>

              <Disclosure title="Technical verification (SHA-256 hashes)" icon={ShieldCheck}>
                <div className="space-y-3 text-xs">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CopyableHash label="Original file SHA-256" value={run.originalSha256} />
                    <CopyableHash label="Output file SHA-256" value={run.outputSha256} />
                  </div>
                  <p className="text-muted-foreground">
                    Download the original upload and the round-tripped output above, then hash each file yourself and
                    compare the result against the values shown here.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Windows (PowerShell)</div>
                      <code className="block rounded-md bg-muted px-2 py-1.5 font-mono">Get-FileHash -Algorithm SHA256 .\file.xer</code>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Mac / Linux</div>
                      <code className="block rounded-md bg-muted px-2 py-1.5 font-mono">shasum -a 256 file.xer</code>
                    </div>
                  </div>
                  {(run.originalSha256 || run.outputSha256) && (
                    <p className="text-muted-foreground">
                      The 64-character hex string the command prints should match the SHA-256 value shown for that file above.
                    </p>
                  )}
                </div>
              </Disclosure>

              {Object.entries(groups).map(([category, differences]) => {
                const categoryStyle = categoryToneStyles[categoryTone[category] ?? "neutral"];
                return (
                  <div key={category} className="space-y-2">
                    <h4 className="text-sm font-semibold">{categoryNames[category] ?? category}</h4>
                    <ul className="space-y-1.5 text-sm">
                      {differences.map((difference, index) => (
                        <li key={`${category}-${index}`} className={cn("rounded-r-lg border-l-4 px-3 py-2 text-foreground/90", categoryStyle)}>
                          {difference.message}
                          {(difference.original !== undefined || difference.generated !== undefined) && (
                            <div className="mt-1.5 space-y-0.5 font-mono text-xs break-all text-muted-foreground">
                              <div>Original: {JSON.stringify(difference.original)}</div>
                              <div>Generated: {JSON.stringify(difference.generated)}</div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function XerRoundTrip({ projectId }: { projectId: string }) {
  const { data: uploads = [], isLoading } = useXerUploads(projectId);
  const upload = useUploadXer(projectId);
  const runTest = useRunXerNullTest(projectId);
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);

  const submit = async () => {
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      setFile(null);
      toast({ title: "XER stored", description: "The immutable original is ready for a null test." });
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Upload failed", variant: "destructive" });
    }
  };

  const run = async (uploadId: string) => {
    try {
      await runTest.mutateAsync(uploadId);
    } catch (error) {
      toast({ title: "Run failed", description: error instanceof Error ? error.message : "Run failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard>
        <SectionHeader
          icon={FileUp}
          title="XER round-trip null test"
          description="Reads and writes the file without changing schedule data, then verifies exact byte fidelity."
          gradient="blue"
        />
        <div className="p-6 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="file"
              accept=".xer"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={upload.isPending}
            />
            <Button onClick={submit} disabled={!file || upload.isPending} className="gap-2">
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Store XER
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Maximum size: 50 MB. Original bytes are retained as the immutable comparison baseline.</p>
        </div>
      </GlassCard>

      <GlassCard delay={0.1}>
        <SectionHeader
          icon={Play}
          title="Uploads and run history"
          description={uploads.length > 0 ? `${uploads.length} file${uploads.length === 1 ? "" : "s"} on record` : undefined}
          gradient="purple"
        />
        <div className="p-6 space-y-4">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : uploads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No XER files uploaded yet.</p>
          ) : (
            uploads.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      Uploaded {new Date(item.createdAt).toLocaleString()} · ERMHDR {item.detectedVersion ?? "not detected"}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => run(item.id)} disabled={runTest.isPending} className="gap-2">
                    {runTest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Run null test
                  </Button>
                </div>
                {item.parseError && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-400">
                    Upload validation: {item.parseError}
                  </div>
                )}
                {item.runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs yet.</p>
                ) : (
                  item.runs.map((history, index) => {
                    // item.runs is newest-first; number runs oldest=1 so "Run N of Total" reads chronologically.
                    const totalRuns = item.runs.length;
                    const runNumber = totalRuns - index;
                    return (
                      <RunHistoryItem
                        key={history.id}
                        projectId={projectId}
                        run={history}
                        runNumber={runNumber}
                        totalRuns={totalRuns}
                        defaultOpen={index === 0}
                      />
                    );
                  })
                )}
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}
