import React, { createContext, useContext, useReducer, useCallback, ReactNode } from "react";
import { type ProgressEvent } from "@/lib/schedule-api";
import { type RunTokenUsageSummary, type AnalysisProgressEvent } from "@/lib/analysis-api";

export interface ScheduleUploadState {
  isUploading: boolean;
  progress: ProgressEvent | null;
  lastCost: RunTokenUsageSummary | null;
  error: string | null;
}

export interface DocumentUploadState {
  isUploading: boolean;
  uploadingCount: number;
  error: string | null;
}

export interface AnalysisState {
  isAnalyzing: boolean;
  progress: AnalysisProgressEvent | null;
  lastCost: RunTokenUsageSummary | null;
  error: string | null;
}

export interface ProjectUploadState {
  schedule: ScheduleUploadState;
  documents: DocumentUploadState;
  analysis: AnalysisState;
}

type UploadStateMap = Record<string, ProjectUploadState>;

type UploadAction =
  | { type: "SCHEDULE_UPLOAD_START"; projectId: string }
  | { type: "SCHEDULE_UPLOAD_PROGRESS"; projectId: string; progress: ProgressEvent }
  | { type: "SCHEDULE_UPLOAD_SUCCESS"; projectId: string; cost: RunTokenUsageSummary | null }
  | { type: "SCHEDULE_UPLOAD_ERROR"; projectId: string; error: string }
  | { type: "SCHEDULE_UPLOAD_RESET"; projectId: string }
  | { type: "DOCUMENT_UPLOAD_START"; projectId: string; count: number }
  | { type: "DOCUMENT_UPLOAD_SUCCESS"; projectId: string }
  | { type: "DOCUMENT_UPLOAD_ERROR"; projectId: string; error: string }
  | { type: "DOCUMENT_UPLOAD_RESET"; projectId: string }
  | { type: "ANALYSIS_START"; projectId: string }
  | { type: "ANALYSIS_PROGRESS"; projectId: string; progress: AnalysisProgressEvent }
  | { type: "ANALYSIS_SUCCESS"; projectId: string; cost: RunTokenUsageSummary | null }
  | { type: "ANALYSIS_ERROR"; projectId: string; error: string }
  | { type: "ANALYSIS_RESET"; projectId: string };

const initialProjectState: ProjectUploadState = {
  schedule: {
    isUploading: false,
    progress: null,
    lastCost: null,
    error: null,
  },
  documents: {
    isUploading: false,
    uploadingCount: 0,
    error: null,
  },
  analysis: {
    isAnalyzing: false,
    progress: null,
    lastCost: null,
    error: null,
  },
};

function getProjectState(state: UploadStateMap, projectId: string): ProjectUploadState {
  return state[projectId] || initialProjectState;
}

function uploadReducer(state: UploadStateMap, action: UploadAction): UploadStateMap {
  const projectId = action.projectId;
  const projectState = getProjectState(state, projectId);

  switch (action.type) {
    case "SCHEDULE_UPLOAD_START":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          schedule: {
            isUploading: true,
            progress: { type: "progress", stage: "uploading", message: "Starting upload...", percentage: 0 },
            lastCost: null,
            error: null,
          },
        },
      };

    case "SCHEDULE_UPLOAD_PROGRESS":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          schedule: {
            ...projectState.schedule,
            progress: action.progress,
          },
        },
      };

    case "SCHEDULE_UPLOAD_SUCCESS":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          schedule: {
            isUploading: false,
            progress: null,
            lastCost: action.cost,
            error: null,
          },
        },
      };

    case "SCHEDULE_UPLOAD_ERROR":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          schedule: {
            isUploading: false,
            progress: null,
            lastCost: null,
            error: action.error,
          },
        },
      };

    case "SCHEDULE_UPLOAD_RESET":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          schedule: initialProjectState.schedule,
        },
      };

    case "DOCUMENT_UPLOAD_START":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          documents: {
            isUploading: true,
            uploadingCount: action.count,
            error: null,
          },
        },
      };

    case "DOCUMENT_UPLOAD_SUCCESS":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          documents: {
            isUploading: false,
            uploadingCount: 0,
            error: null,
          },
        },
      };

    case "DOCUMENT_UPLOAD_ERROR":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          documents: {
            isUploading: false,
            uploadingCount: 0,
            error: action.error,
          },
        },
      };

    case "DOCUMENT_UPLOAD_RESET":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          documents: initialProjectState.documents,
        },
      };

    case "ANALYSIS_START":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          analysis: {
            isAnalyzing: true,
            progress: { type: "progress", stage: "loading_documents", message: "Starting analysis...", percentage: 0 },
            lastCost: null,
            error: null,
          },
        },
      };

    case "ANALYSIS_PROGRESS":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          analysis: {
            ...projectState.analysis,
            progress: action.progress,
          },
        },
      };

    case "ANALYSIS_SUCCESS":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          analysis: {
            isAnalyzing: false,
            progress: null,
            lastCost: action.cost,
            error: null,
          },
        },
      };

    case "ANALYSIS_ERROR":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          analysis: {
            isAnalyzing: false,
            progress: null,
            lastCost: null,
            error: action.error,
          },
        },
      };

    case "ANALYSIS_RESET":
      return {
        ...state,
        [projectId]: {
          ...projectState,
          analysis: initialProjectState.analysis,
        },
      };

    default:
      return state;
  }
}

interface UploadStateContextValue {
  getProjectUploadState: (projectId: string) => ProjectUploadState;
  startScheduleUpload: (projectId: string) => void;
  updateScheduleProgress: (projectId: string, progress: ProgressEvent) => void;
  completeScheduleUpload: (projectId: string, cost: RunTokenUsageSummary | null) => void;
  failScheduleUpload: (projectId: string, error: string) => void;
  startDocumentUpload: (projectId: string, count: number) => void;
  completeDocumentUpload: (projectId: string) => void;
  failDocumentUpload: (projectId: string, error: string) => void;
  startAnalysis: (projectId: string) => void;
  updateAnalysisProgress: (projectId: string, progress: AnalysisProgressEvent) => void;
  completeAnalysis: (projectId: string, cost: RunTokenUsageSummary | null) => void;
  failAnalysis: (projectId: string, error: string) => void;
}

const UploadStateContext = createContext<UploadStateContextValue | null>(null);

interface UploadStateProviderProps {
  children: ReactNode;
}

export function UploadStateProvider({ children }: UploadStateProviderProps) {
  const [state, dispatch] = useReducer(uploadReducer, {});

  const getProjectUploadState = useCallback(
    (projectId: string): ProjectUploadState => getProjectState(state, projectId),
    [state]
  );

  const startScheduleUpload = useCallback((projectId: string) => {
    dispatch({ type: "SCHEDULE_UPLOAD_START", projectId });
  }, []);

  const updateScheduleProgress = useCallback((projectId: string, progress: ProgressEvent) => {
    dispatch({ type: "SCHEDULE_UPLOAD_PROGRESS", projectId, progress });
  }, []);

  const completeScheduleUpload = useCallback((projectId: string, cost: RunTokenUsageSummary | null) => {
    dispatch({ type: "SCHEDULE_UPLOAD_SUCCESS", projectId, cost });
  }, []);

  const failScheduleUpload = useCallback((projectId: string, error: string) => {
    dispatch({ type: "SCHEDULE_UPLOAD_ERROR", projectId, error });
  }, []);

  const startDocumentUpload = useCallback((projectId: string, count: number) => {
    dispatch({ type: "DOCUMENT_UPLOAD_START", projectId, count });
  }, []);

  const completeDocumentUpload = useCallback((projectId: string) => {
    dispatch({ type: "DOCUMENT_UPLOAD_SUCCESS", projectId });
  }, []);

  const failDocumentUpload = useCallback((projectId: string, error: string) => {
    dispatch({ type: "DOCUMENT_UPLOAD_ERROR", projectId, error });
  }, []);

  const startAnalysis = useCallback((projectId: string) => {
    dispatch({ type: "ANALYSIS_START", projectId });
  }, []);

  const updateAnalysisProgress = useCallback((projectId: string, progress: AnalysisProgressEvent) => {
    dispatch({ type: "ANALYSIS_PROGRESS", projectId, progress });
  }, []);

  const completeAnalysis = useCallback((projectId: string, cost: RunTokenUsageSummary | null) => {
    dispatch({ type: "ANALYSIS_SUCCESS", projectId, cost });
  }, []);

  const failAnalysis = useCallback((projectId: string, error: string) => {
    dispatch({ type: "ANALYSIS_ERROR", projectId, error });
  }, []);

  const value: UploadStateContextValue = {
    getProjectUploadState,
    startScheduleUpload,
    updateScheduleProgress,
    completeScheduleUpload,
    failScheduleUpload,
    startDocumentUpload,
    completeDocumentUpload,
    failDocumentUpload,
    startAnalysis,
    updateAnalysisProgress,
    completeAnalysis,
    failAnalysis,
  };

  return (
    <UploadStateContext.Provider value={value}>
      {children}
    </UploadStateContext.Provider>
  );
}

export function useUploadState(projectId: string) {
  const context = useContext(UploadStateContext);
  if (!context) {
    throw new Error("useUploadState must be used within an UploadStateProvider");
  }

  const projectState = context.getProjectUploadState(projectId);

  return {
    scheduleUpload: projectState.schedule,
    documentUpload: projectState.documents,
    analysis: projectState.analysis,
    startScheduleUpload: () => context.startScheduleUpload(projectId),
    updateScheduleProgress: (progress: ProgressEvent) => context.updateScheduleProgress(projectId, progress),
    completeScheduleUpload: (cost: RunTokenUsageSummary | null) => context.completeScheduleUpload(projectId, cost),
    failScheduleUpload: (error: string) => context.failScheduleUpload(projectId, error),
    startDocumentUpload: (count: number) => context.startDocumentUpload(projectId, count),
    completeDocumentUpload: () => context.completeDocumentUpload(projectId),
    failDocumentUpload: (error: string) => context.failDocumentUpload(projectId, error),
    startAnalysis: () => context.startAnalysis(projectId),
    updateAnalysisProgress: (progress: AnalysisProgressEvent) => context.updateAnalysisProgress(projectId, progress),
    completeAnalysis: (cost: RunTokenUsageSummary | null) => context.completeAnalysis(projectId, cost),
    failAnalysis: (error: string) => context.failAnalysis(projectId, error),
  };
}
