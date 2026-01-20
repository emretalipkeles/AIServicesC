import { useState, useCallback } from "react";
import { useProjectDocuments, useUploadDocuments, useDeleteDocument, type ProjectDocumentDto, type ProjectDocumentType } from "@/lib/project-documents-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface DocumentUploadProps {
  projectId: string;
}

const documentTypeLabels: Record<ProjectDocumentType, string> = {
  idr: "Inspector Daily Report (IDR)",
  ncr: "Non-Conformance Report (NCR)",
  field_memo: "Field Memo",
  cpm_schedule: "CPM Schedule",
  contract_plan: "Contract Plan",
  dsc_claim: "DSC Claim",
  other: "Other",
};

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-yellow-500", label: "Pending" },
  processing: { icon: Loader2, color: "text-blue-500", label: "Processing" },
  completed: { icon: CheckCircle, color: "text-green-500", label: "Completed" },
  failed: { icon: AlertCircle, color: "text-red-500", label: "Failed" },
};

export function DocumentUpload({ projectId }: DocumentUploadProps) {
  const { data: documents, isLoading } = useProjectDocuments(projectId);
  const uploadDocuments = useUploadDocuments();
  const deleteDocument = useDeleteDocument();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<ProjectDocumentType>("idr");
  const [isDragOver, setIsDragOver] = useState(false);

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

    try {
      const result = await uploadDocuments.mutateAsync({
        projectId,
        files: validFiles,
        documentType: selectedType,
      });

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
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload documents",
        variant: "destructive",
      });
    }
  }, [projectId, selectedType, uploadDocuments, toast]);

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
    <Card>
      <CardHeader>
        <CardTitle>Project Documents</CardTitle>
        <CardDescription>
          Upload Inspector Daily Reports (IDRs), NCRs, and Field Memos for delay analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Select value={selectedType} onValueChange={(v) => setSelectedType(v as ProjectDocumentType)}>
              <SelectTrigger>
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

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-border'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
          />
          <Upload className={`w-10 h-10 mx-auto mb-4 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
          <h3 className="font-medium mb-2">
            {isDragOver ? "Drop files here" : "Drag and drop files here"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            PDF and Word documents accepted
          </p>
          <Button
            variant="outline"
            onClick={() => document.getElementById('file-upload')?.click()}
            disabled={uploadDocuments.isPending}
          >
            {uploadDocuments.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              "Browse Files"
            )}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading documents...
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">
              Uploaded Documents ({documents.length})
            </h4>
            <div className="divide-y divide-border rounded-lg border">
              {documents.map((doc) => {
                const status = statusConfig[doc.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{doc.filename}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{documentTypeLabels[doc.documentType as ProjectDocumentType] || doc.documentType}</span>
                          <span>•</span>
                          <span>{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={doc.status === 'completed' ? 'default' : doc.status === 'failed' ? 'destructive' : 'secondary'} className="gap-1">
                        <StatusIcon className={`w-3 h-3 ${status.icon === Loader2 ? 'animate-spin' : ''}`} />
                        {status.label}
                      </Badge>
                      {doc.errorMessage && (
                        <span className="text-xs text-destructive max-w-[200px] truncate" title={doc.errorMessage}>
                          {doc.errorMessage}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No documents uploaded yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
