import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  type: "static" | "delay-analysis";
  delayAnalysisProjectId?: string;
}

interface TabContextType {
  tabs: Tab[];
  activeTab: string;
  activeDelayAnalysisProjectId: string | null;
  addTab: (tab: Tab) => void;
  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveDelayAnalysisProject: (projectId: string | null) => void;
}

const TabContext = createContext<TabContextType | null>(null);

export function useTabContext() {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error("useTabContext must be used within a TabProvider");
  }
  return context;
}

export function useOptionalTabContext() {
  return useContext(TabContext);
}

interface TabProviderProps {
  children: ReactNode;
}

export function TabProvider({ children }: TabProviderProps) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [activeDelayAnalysisProjectId, setActiveDelayAnalysisProjectId] = useState<string | null>(null);

  const setActiveDelayAnalysisProject = useCallback((projectId: string | null) => {
    setActiveDelayAnalysisProjectId(projectId);
  }, []);

  const addTab = useCallback((tab: Tab) => {
    setTabs((prev) => {
      const existingTab = prev.find((t) => t.id === tab.id);
      if (existingTab) {
        return prev;
      }
      return [...prev, tab];
    });
    setTimeout(() => setActiveTab(tab.id), 50);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const tabIndex = prev.findIndex((t) => t.id === tabId);
      const newTabs = prev.filter((t) => t.id !== tabId);
      if (newTabs.length > 0) {
        const nextIndex = Math.min(tabIndex, newTabs.length - 1);
        setTimeout(() => setActiveTab(newTabs[nextIndex].id), 0);
      } else {
        setTimeout(() => setActiveTab(""), 0);
      }
      return newTabs;
    });
  }, []);

  return (
    <TabContext.Provider
      value={{
        tabs,
        activeTab,
        activeDelayAnalysisProjectId,
        addTab,
        setActiveTab,
        closeTab,
        setActiveDelayAnalysisProject,
      }}
    >
      {children}
    </TabContext.Provider>
  );
}
