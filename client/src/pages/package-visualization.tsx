import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Package, ArrowLeft, Boxes, Database, ChevronRight, ChevronDown, Layers, FileText, Download } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface DimensionDependency {
  kind: string;
  name: string;
  path?: string;
  accountCount?: number;
  hasCalculations?: boolean;
}

interface ModelInfo {
  name: string;
  displayName?: string;
  type: string;
  path: string;
  dimensions: DimensionDependency[];
}

interface PackageAnalysis {
  packageId: string;
  packageName: string;
  models: ModelInfo[];
  dimensions: Array<{
    name: string;
    modelName: string;
    path: string;
    accountCount: number;
    hasCalculations: boolean;
  }>;
  namedSets: Array<{
    name: string;
    type: string;
    path: string;
  }>;
  fileCount: number;
  analyzedAt: string;
}

interface PretPackageSession {
  id: string;
  packageId: string;
  packageName: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface MemberProperties {
  rollUp?: string;
  accountType?: string;
  calculationMethod?: string;
  debitCredit?: string;
  numericFormat?: string;
  timeConversionMethod?: string;
  currencyConversionMethod?: string;
  hasCalculations: boolean;
  note?: string;
}

interface MemberNode {
  key: string;
  name: string;
  parent: string;
  properties: MemberProperties;
  children: MemberNode[];
}

interface DimensionMembersResponse {
  dimensionPath: string;
  totalMembers: number;
  tree: MemberNode[];
}

interface SelectedDimension {
  modelName: string;
  dimension: DimensionDependency;
}

interface PackageVisualizationProps {
  packageId?: string;
  embedded?: boolean;
  params?: { packageId?: string };
}

function MemberTreeNode({ 
  node, 
  level = 0, 
  selectedMemberKey, 
  onSelectMember 
}: { 
  node: MemberNode; 
  level?: number; 
  selectedMemberKey: string | null;
  onSelectMember: (member: MemberNode) => void;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedMemberKey === node.key;

  return (
    <div>
      <button
        onClick={() => {
          onSelectMember(node);
          if (hasChildren) setExpanded(!expanded);
        }}
        className={`flex flex-wrap items-center gap-1.5 w-full text-left text-sm py-1.5 px-2 rounded transition-colors ${
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover-elevate'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        data-testid={`tree-node-${node.key}`}
      >
        {hasChildren ? (
          <span className="w-4 h-4 flex items-center justify-center">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </span>
        ) : (
          <span className="w-4 h-4 flex items-center justify-center">
            <FileText className="w-3 h-3 text-muted-foreground/50" />
          </span>
        )}
        <span className="truncate" data-testid={`tree-node-name-${node.key}`}>
          ({node.key}) {node.name}
        </span>
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <MemberTreeNode
              key={child.key}
              node={child}
              level={level + 1}
              selectedMemberKey={selectedMemberKey}
              onSelectMember={onSelectMember}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PackageVisualization({ packageId: propPackageId, embedded = false, params: routeParams }: PackageVisualizationProps) {
  const hookParams = useParams<{ packageId: string }>();
  const packageId = propPackageId || routeParams?.packageId || hookParams.packageId;
  const [, setLocation] = useLocation();
  const [selectedDimension, setSelectedDimension] = useState<SelectedDimension | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberNode | null>(null);

  const { data: packageData, isLoading, error } = useQuery<{ success: boolean; session: PretPackageSession }>({
    queryKey: ['/api/pret/packages', packageId],
    enabled: !!packageId,
  });

  const { data: analysisData, isLoading: analysisLoading } = useQuery<PackageAnalysis>({
    queryKey: ['/api/pret/packages', packageId, 'analyze'],
    enabled: !!packageId && packageData?.session?.status === 'ready',
  });

  const dimensionPath = selectedDimension?.dimension.path;
  
  const { data: membersData, isLoading: membersLoading } = useQuery<DimensionMembersResponse>({
    queryKey: ['/api/pret/packages', packageId, 'dimension-members', dimensionPath],
    queryFn: async () => {
      const response = await fetch(`/api/pret/packages/${packageId}/dimension-members?path=${encodeURIComponent(dimensionPath!)}`);
      if (!response.ok) throw new Error('Failed to fetch dimension members');
      return response.json();
    },
    enabled: !!packageId && !!dimensionPath,
  });

  const flatMemberCount = useMemo(() => {
    if (!membersData?.tree) return 0;
    const countNodes = (nodes: MemberNode[]): number => {
      return nodes.reduce((acc, node) => acc + 1 + countNodes(node.children), 0);
    };
    return countNodes(membersData.tree);
  }, [membersData?.tree]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading-package">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground" data-testid="text-loading-package">Loading package...</p>
        </div>
      </div>
    );
  }

  if (error || !packageData?.success) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="error-package">
        <Card className="max-w-md">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <Package className="w-12 h-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold" data-testid="text-error-title">Package Not Found</h2>
              <p className="text-sm text-muted-foreground" data-testid="text-error-description">
                The requested package could not be found or has not been uploaded yet.
              </p>
              {!embedded && (
                <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-go-back-error">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const session = packageData.session;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ready':
        return 'default';
      case 'uploading':
      case 'extracting':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const handleDimensionClick = (modelName: string, dimension: DimensionDependency) => {
    setSelectedDimension({ modelName, dimension });
    setSelectedMember(null);
  };

  const isDimensionSelected = (modelName: string, dimName: string) => {
    return selectedDimension?.modelName === modelName && selectedDimension?.dimension.name === dimName;
  };

  const handleMemberSelect = (member: MemberNode) => {
    setSelectedMember(member);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b">
        <div className="flex flex-wrap items-center gap-4">
          {!embedded && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
              <Package className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold" data-testid="text-package-name">
                {session.packageName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getStatusBadgeVariant(session.status)} className="text-[10px] px-1.5 py-0" data-testid="badge-package-status">
                  {session.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground" data-testid="text-imported-date">
                  Imported {new Date(session.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
        {session.status === 'ready' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = `/api/pret/packages/${packageId}/download`;
            }}
            data-testid="button-download-package"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-64 border-r flex flex-col bg-muted/30 min-h-0">
          <div className="overflow-auto flex-1 min-h-0">
            {analysisLoading ? (
              <div className="flex flex-wrap items-center gap-2 p-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm" data-testid="text-loading-analysis">Loading...</span>
              </div>
            ) : analysisData?.models?.length ? (
              <Accordion type="multiple" defaultValue={analysisData.models.map(m => m.name)} className="w-full">
                {analysisData.models.map((model, modelIndex) => (
                  <AccordionItem 
                    key={model.name} 
                    value={model.name} 
                    className="border-b border-border/50"
                    data-testid={`accordion-model-${modelIndex}`}
                  >
                    <AccordionTrigger 
                      className="px-3 py-2 hover:no-underline hover-elevate text-sm"
                      data-testid={`accordion-trigger-${modelIndex}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Boxes className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium truncate" data-testid={`text-model-name-${modelIndex}`}>
                          {model.displayName || model.name}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <div className="flex flex-col">
                        {model.dimensions.map((dim, dimIndex) => (
                          <button
                            key={`${dim.kind}-${dim.name}`}
                            onClick={() => handleDimensionClick(model.name, dim)}
                            className={`flex flex-wrap items-center gap-2 px-3 py-2 pl-9 text-left text-sm transition-colors ${
                              isDimensionSelected(model.name, dim.name)
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover-elevate text-foreground'
                            }`}
                            data-testid={`dimension-item-${modelIndex}-${dimIndex}`}
                          >
                            <Database className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                            <span className="truncate" data-testid={`dimension-name-${modelIndex}-${dimIndex}`}>
                              {dim.name}
                            </span>
                            <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="p-4 text-sm text-muted-foreground" data-testid="text-no-models">
                No models found
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 flex min-h-0 overflow-hidden">
          {selectedDimension ? (
            <>
              <div className="flex-1 min-w-[300px] border-r flex flex-col bg-background min-h-0 overflow-hidden">
                <div className="px-4 py-3 border-b flex-shrink-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Database className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold" data-testid="text-dimension-tree-header">
                      {selectedDimension.dimension.name}
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-member-count">
                    {flatMemberCount} members
                  </p>
                </div>
                <ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-scrollbar]]:w-1.5 [&_[data-radix-scroll-area-scrollbar]]:opacity-30 hover:[&_[data-radix-scroll-area-scrollbar]]:opacity-80 [&_[data-radix-scroll-area-scrollbar]]:transition-opacity">
                  {membersLoading ? (
                    <div className="flex flex-wrap items-center justify-center gap-2 p-8 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm" data-testid="text-loading-members">Loading members...</span>
                    </div>
                  ) : membersData?.tree?.length ? (
                    <div className="py-2" data-testid="member-tree-container">
                      {membersData.tree.map((node) => (
                        <MemberTreeNode
                          key={node.key}
                          node={node}
                          selectedMemberKey={selectedMember?.key ?? null}
                          onSelectMember={handleMemberSelect}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center" data-testid="text-no-members">
                      No members found
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div className="w-[320px] flex-shrink-0 overflow-auto bg-muted/10 p-4">
                {selectedMember ? (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold truncate" data-testid="text-member-name">
                          {selectedMember.name}
                        </h2>
                        <p className="text-xs text-muted-foreground" data-testid="text-member-key">
                          {selectedMember.key}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-0.5">Key</p>
                          <p className="font-medium" data-testid="text-prop-key">{selectedMember.key}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Name</p>
                          <p className="font-medium truncate" data-testid="text-prop-name">{selectedMember.name}</p>
                        </div>
                        {selectedMember.properties.accountType && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Account Type</p>
                            <p className="font-medium" data-testid="text-prop-account-type">{selectedMember.properties.accountType}</p>
                          </div>
                        )}
                        {selectedMember.properties.debitCredit && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Debit/Credit</p>
                            <p className="font-medium" data-testid="text-prop-debit-credit">{selectedMember.properties.debitCredit}</p>
                          </div>
                        )}
                        {selectedMember.properties.timeConversionMethod && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Time Conversion</p>
                            <p className="font-medium" data-testid="text-prop-time-conversion">{selectedMember.properties.timeConversionMethod}</p>
                          </div>
                        )}
                        {selectedMember.properties.numericFormat && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Numeric Format</p>
                            <p className="font-medium" data-testid="text-prop-numeric-format">{selectedMember.properties.numericFormat}</p>
                          </div>
                        )}
                        {selectedMember.properties.rollUp && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Roll Up</p>
                            <p className="font-medium" data-testid="text-prop-rollup">{selectedMember.properties.rollUp}</p>
                          </div>
                        )}
                        {selectedMember.properties.calculationMethod && (
                          <div>
                            <p className="text-muted-foreground mb-0.5">Calc Method</p>
                            <p className="font-medium" data-testid="text-prop-calc-method">{selectedMember.properties.calculationMethod}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-muted-foreground mb-0.5">Has Calcs</p>
                          <p className="font-medium" data-testid="text-prop-has-calcs">{selectedMember.properties.hasCalculations ? 'Yes' : 'No'}</p>
                        </div>
                      </div>
                      {selectedMember.properties.note && (
                        <div className="text-xs pt-2 border-t">
                          <p className="text-muted-foreground mb-0.5">Note</p>
                          <p className="font-medium" data-testid="text-prop-note">{selectedMember.properties.note}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center" data-testid="placeholder-select-member">
                    <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground" data-testid="text-select-member">Select a member</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center h-full text-center bg-muted/10" data-testid="placeholder-select-dimension">
              <Layers className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground" data-testid="text-select-dimension">Select a dimension to view members</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
