import { useState } from "react";
import { ChevronUp, ChevronDown, MapPin, Plus, X, AlertTriangle } from "lucide-react";
import { GlassCard, SectionHeader, selectTriggerStyles } from "../ui/premium-components";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCorridorLocations,
  useUpdateCorridorLocation,
  useSetLocationOverride,
  useClearLocationOverride,
  type CorridorLocationDto,
} from "@/lib/measured-mile-api";

interface CorridorLocationManagerProps {
  projectId: string;
  unmatchedEvidenceSamples: string[];
}

/**
 * Corridor ordering is a seeded best-guess default (west->east), not ground truth -- surface it
 * as inspectable and user-editable rather than a silent hardcoded assumption. Raw-text overrides
 * let a reviewer correct a specific mis-resolved location string without touching the regex matcher.
 */
export function CorridorLocationManager({ projectId, unmatchedEvidenceSamples }: CorridorLocationManagerProps) {
  const { data, isLoading } = useCorridorLocations(projectId);
  const updateLocation = useUpdateCorridorLocation(projectId);
  const setOverride = useSetLocationOverride(projectId);
  const clearOverride = useClearLocationOverride(projectId);
  const { toast } = useToast();

  const [newOverrideText, setNewOverrideText] = useState("");
  const [newOverrideKey, setNewOverrideKey] = useState("");

  if (isLoading || !data) return null;

  const locations = [...data.locations].sort((a, b) => a.defaultStationOrder - b.defaultStationOrder);

  const moveLocation = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= locations.length) return;
    const a = locations[index];
    const b = locations[target];
    updateLocation.mutate(
      { locationKey: a.key, stationOrder: b.defaultStationOrder },
      { onError: () => toast({ title: "Error", description: "Failed to reorder corridor location", variant: "destructive" }) }
    );
    updateLocation.mutate(
      { locationKey: b.key, stationOrder: a.defaultStationOrder },
      { onError: () => toast({ title: "Error", description: "Failed to reorder corridor location", variant: "destructive" }) }
    );
  };

  const handleAddOverride = () => {
    if (!newOverrideText.trim() || !newOverrideKey) {
      toast({ title: "Missing input", description: "Enter both the raw text and the corridor location", variant: "destructive" });
      return;
    }
    setOverride.mutate(
      { rawText: newOverrideText.trim(), locationKey: newOverrideKey },
      {
        onSuccess: () => {
          toast({ title: "Override saved" });
          setNewOverrideText("");
          setNewOverrideKey("");
        },
        onError: () => toast({ title: "Error", description: "Failed to save override", variant: "destructive" }),
      }
    );
  };

  return (
    <GlassCard>
      <SectionHeader
        icon={MapPin}
        title="Corridor location mapping"
        description="How raw location text from schedule activities and POD reports resolves to a corridor position — a seeded west-to-east default you can reorder and correct."
        gradient="purple"
      />
      <div className="p-6 space-y-6">
        {unmatchedEvidenceSamples.length > 0 && (
          <div className="flex items-start gap-2 text-sm rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div>{unmatchedEvidenceSamples.length} raw location string(s) could not be matched to a corridor location, e.g.:</div>
              <ul className="mt-1 space-y-0.5 font-mono text-xs">
                {unmatchedEvidenceSamples.slice(0, 5).map((s, i) => (
                  <li key={i}>"{s}"</li>
                ))}
              </ul>
              <div className="mt-1 text-xs">Add a correction below to resolve one exactly.</div>
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Corridor order (west → east)
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {locations.map((loc, index) => (
              <LocationRow key={loc.key} location={loc} index={index} total={locations.length} onMove={moveLocation} />
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border/50">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Location text corrections
          </div>
          {data.overrides.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {data.overrides.map((o) => (
                <li key={o.rawText} className="flex items-center justify-between text-sm bg-muted/40 rounded-md px-3 py-1.5">
                  <span>
                    <span className="font-mono text-xs">"{o.rawText}"</span> → {locations.find((l) => l.key === o.locationKey)?.label ?? o.locationKey}
                  </span>
                  <button
                    onClick={() =>
                      clearOverride.mutate(
                        { rawText: o.rawText },
                        { onError: () => toast({ title: "Error", description: "Failed to remove override", variant: "destructive" }) }
                      )
                    }
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove override"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <Input
                placeholder='Exact raw text, e.g. "MADISON AND 13TH"'
                value={newOverrideText}
                onChange={(e) => setNewOverrideText(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="min-w-[180px]">
              <Select value={newOverrideKey} onValueChange={setNewOverrideKey}>
                <SelectTrigger className={selectTriggerStyles}>
                  <SelectValue placeholder="Resolves to..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.key} value={l.key}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={handleAddOverride} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add override
            </Button>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function LocationRow({
  location,
  index,
  total,
  onMove,
}: {
  location: CorridorLocationDto;
  index: number;
  total: number;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted/40">
      <span className="w-6 text-xs text-muted-foreground text-right">{index + 1}</span>
      <span className="flex-1">{location.label}</span>
      <span className="text-xs text-muted-foreground font-mono">~{location.approxDistanceFt.toLocaleString()} ft</span>
      <button
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="Move west"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        onClick={() => onMove(index, 1)}
        disabled={index === total - 1}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="Move east"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}
