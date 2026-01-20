import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProjectDocuments, useUploadDocuments, useDeleteDocument, type ProjectDocumentDto, type ProjectDocumentType } from "@/lib/project-documents-api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUploadState } from "@/contexts/upload-state-context";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Clock, Loader2, File, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { GlassCard, SectionHeader, UploadZone, StatCard, selectTriggerStyles } from "./ui/premium-components";
import { cn } from "@/lib/utils";

interface DocumentUploadProps {
  projectId: string;
}

const documentTypeLabels: Partial<Record<ProjectDocumentType, string>> = {
  idr: "Inspector Daily Report (IDR)",
  ncr: "Non-Conformance Report (NCR)",
  field_memo: "Field Memo",
  contract_plan: "Contract Plan",
  dsc_claim: "DSC Claim",
  other: "Other",
};

const statusConfig: Record<string, { icon: typeof Clock; color: string; bgColor: string; label: string }> = {
  pending: { icon: Clock, color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-500/10", label: "Pending" },
  processing: { icon: Loader2, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-500/10", label: "Processing" },
  completed: { icon: CheckCircle, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-500/10", label: "Completed" },
  failed: { icon: AlertCircle, color: "text-red-600 dark:text-red-400", bgColor: "bg-red-500/10", label: "Failed" },
};

type FilterType = ProjectDocumentType | "all";

export function DocumentUpload({ projectId }: DocumentUploadProps) {
  const { data: documents = [], isLoading } = useProjectDocuments(projectId);
  const uploadDocuments = useUploadDocuments();
  const deleteDocument = useDeleteDocument();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<ProjectDocumentType>("idr");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  const {
    documentUpload,
    startDocumentUpload,
    completeDocumentUpload,
    failDocumentUpload,
  } = useUploadState(projectId);

  const scrollToUpload = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredDocuments = filterType === "all" 
    ? documents 
    : documents.filter(d => d.documentType === filterType);
  
  const completedDocs = documents.filter(d => d.status === 'completed').length;
  const pendingDocs = documents.filter(d => d.status === 'pending' || d.status === 'processing').length;
  const failedDocs = documents.filter(d => d.status === 'failed').length;

  const handleFileDrop = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    const validFiles = fileArray.filter(file => {
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ];
      return validTypes.includes(file.type);
    });

    if (validFiles.length === 0) {
      toast({
        title: "Invalid files",
        description: "Please upload PDF or Word documents only",
        variant: "destructive",
      });
      return;
    }

    startDocumentUpload(validFiles.length);

    try {
      const result = await uploadDocuments.mutateAsync({
        projectId,
        files: validFiles,
        documentType: selectedType,
      });

      completeDocumentUpload();

      if (result.uploaded.length > 0) {
        toast({
          title: "Upload successful",
          description: `${result.uploaded.length} file(s) uploaded successfully`,
        });
      }

      if (result.failed.length > 0) {
        toast({
          title: "Some files failed",
          description: result.failed.map(f => `${f.filename}: ${f.error}`).join(", "),
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to upload documents";
      failDocumentUpload(errorMessage);
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [projectId, selectedType, uploadDocuments, toast, startDocumentUpload, completeDocumentUpload, failDocumentUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileDrop(e.dataTransfer.files);
  }, [handleFileDrop]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileDrop(e.target.files);
      e.target.value = '';
    }
  }, [handleFileDrop]);

  const handleDelete = useCallback(async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      await deleteDocument.mutateAsync({ projectId, documentId });
      toast({ title: "Document deleted" });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete document",
        variant: "destructive",
      });
    }
  }, [projectId, deleteDocument, toast]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Documents" value={documents.length} icon={FolderOpen} />
        <StatCard label="Processed" value={completedDocs} icon={CheckCircle} color="success" />
        <StatCard label="Pending" value={pendingDocs} icon={Clock} color="warning" />
      </div>

      <GlassCard>
        <SectionHeader 
          icon={FolderOpen} 
          title="Uploaded Documents" 
          description={`${documents.length} document${documents.length !== 1 ? 's' : ''} in this project`}
          gradient="teal"
          action={
            <Button onClick={scrollToUpload} size="sm" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload
            </Button>
          }
        />
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Filter by type:</label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <SelectTrigger className={cn(selectTriggerStyles, "w-[260px]")}>
                <SelectValue placeholder="All Documents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Documents</SelectItem>
                {Object.entries(documentTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterType !== "all" && (
              <span className="text-xs text-muted-foreground">
                Showing {filteredDocuments.length} of {documents.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : documents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No documents yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Upload Inspector Daily Reports, NCRs, or Field Memos to begin delay analysis
              </p>
            </motion.div>
          ) : filteredDocuments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <p className="text-sm text-muted-foreground">
                No documents match the selected filter
              </p>
            </motion.div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                <AnimatePresence>
                  {filteredDocuments.map((doc, index) => (
                    <DocumentRow 
                      key={doc.id} 
                      doc={doc} 
                      index={index}
                      onDelete={() => handleDelete(doc.id)} 
                    />
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </div>
      </GlassCard>

      <div ref={uploadSectionRef}>
        <GlassCard delay={0.1}>
          <SectionHeader 
            icon={Upload} 
            title="Upload Documents" 
            description="Add Inspector Daily Reports, NCRs, and Field Memos for analysis"
            gradient="blue"
          />
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Document Type</label>
                <Select value={selectedType} onValueChange={(v) => setSelectedType(v as ProjectDocumentType)}>
                  <SelectTrigger className={selectTriggerStyles}>
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(documentTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
            />

            {documentUpload.isUploading && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-3"
              >
                <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Uploading {documentUpload.uploadingCount} document{documentUpload.uploadingCount !== 1 ? 's' : ''}...
                </span>
              </motion.div>
            )}

            <UploadZone
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              isDragOver={isDragOver}
              isUploading={documentUpload.isUploading || uploadDocuments.isPending}
              onBrowse={() => document.getElementById('file-upload')?.click()}
              title={isDragOver ? "Drop files here" : "Drag and drop files here"}
              description="Upload your project documents for AI analysis"
              icons={[FileText, File]}
              acceptedFormats="PDF and Word documents (.pdf, .doc, .docx)"
            />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

interface DocumentRowProps {
  doc: ProjectDocumentDto;
  index: number;
  onDelete: () => void;
}

function DocumentRow({ doc, index, onDelete }: DocumentRowProps) {
  const status = statusConfig[doc.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "group flex items-center justify-between p-4 rounded-xl",
        "bg-gradient-to-r from-muted/30 to-transparent",
        "border border-border/30 hover:border-border/60",
        "hover:shadow-md transition-all duration-200"
      )}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate text-foreground">{doc.filename}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{documentTypeLabels[doc.documentType as ProjectDocumentType] || doc.documentType}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span>{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
          status.bgColor, status.color
        )}>
          <StatusIcon className={cn("w-3 h-3", status.icon === Loader2 && "animate-spin")} />
          {status.label}
        </div>
        {doc.errorMessage && (
          <span className="text-xs text-destructive max-w-[150px] truncate" title={doc.errorMessage}>
            {doc.errorMessage}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
