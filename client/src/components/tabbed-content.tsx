import { useRef, useEffect } from "react";
import { Map as MapIcon, Bot, X, Activity, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JourneyDashboard } from "./journey-dashboard";
import { AgentSetup } from "./agent-setup";
import { DelayAnalysis } from "./delay-analysis";
import { UserManagement } from "./user-management";
import { ThemeToggle } from "./theme-toggle";
import { SettingsMenu } from "./settings-menu";
import { AddMenu } from "./add-menu";
import { UserMenu } from "./user-menu";
import { useTabContext, type Tab } from "@/contexts/tab-context";
import PackageVisualization from "@/pages/package-visualization";

interface StaticTab {
  id: string;
  label: string;
  icon: LucideIcon;
}

const defaultTabs: StaticTab[] = [];

const settingsTabMap: Record<string, Tab> = {
  "agent-setup": { id: "agent-setup", label: "Agent Setup", icon: Bot, type: "static" },
  "delay-analysis": { id: "delay-analysis", label: "Delay Interpretation", icon: Activity, type: "delay-analysis" },
  "user-management": { id: "user-management", label: "User Management", icon: Users, type: "static" },
};

export function TabbedContent() {
  const { tabs: dynamicTabs, activeTab, setActiveTab, addTab, closeTab } = useTabContext();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map());

  const allTabs = [...defaultTabs.map(t => ({ ...t, type: "static" as const })), ...dynamicTabs];

  useEffect(() => {
    const activeTabEl = tabRefs.current.get(activeTab);
    if (activeTabEl && indicatorRef.current) {
      const { offsetLeft, offsetWidth } = activeTabEl;
      indicatorRef.current.style.left = `${offsetLeft}px`;
      indicatorRef.current.style.width = `${offsetWidth}px`;
    }
  }, [activeTab, allTabs]);

  const setTabRef = (id: string) => (el: HTMLElement | null) => {
    if (el) {
      tabRefs.current.set(id, el);
    } else {
      tabRefs.current.delete(id);
    }
  };

  const handleSettingsNavigate = (settingId: string) => {
    const tabDef = settingsTabMap[settingId];
    if (tabDef) {
      const existingTab = allTabs.find(t => t.id === settingId);
      if (!existingTab) {
        addTab(tabDef);
      }
      setTimeout(() => setActiveTab(settingId), 50);
    }
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const renderTabContent = (tab: Tab | StaticTab) => {
    if (tab.id === "journey") {
      return <JourneyDashboard />;
    }
    if (tab.id === "agent-setup") {
      return <AgentSetup />;
    }
    if (tab.id === "delay-analysis") {
      return <DelayAnalysis />;
    }
    if (tab.id === "user-management") {
      return <UserManagement />;
    }
    if ("type" in tab && tab.type === "package" && tab.packageId) {
      return <PackageVisualization packageId={tab.packageId} embedded />;
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-background theme-transition">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border theme-transition flex-shrink-0">
        <div className="flex items-center h-full">
          <div className="flex items-center gap-3 mr-8">
            <span className="font-bold text-lg text-primary"></span>
          </div>
          <nav className="relative flex items-center h-full">
            {allTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isClosable = "type" in tab && tab.type === "package";
              return (
                <Button
                  key={tab.id}
                  ref={setTabRef(tab.id)}
                  onClick={() => setActiveTab(tab.id)}
                  variant="ghost"
                  className={`relative gap-2 ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {isClosable && (
                    <X
                      className="w-3 h-3 ml-1 hover:text-destructive"
                      onClick={(e) => handleCloseTab(e, tab.id)}
                    />
                  )}
                </Button>
              );
            })}
            <div
              ref={indicatorRef}
              className="tab-indicator"
              style={{
                left: 0,
                width: 0,
              }}
            />
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <AddMenu onNavigate={handleSettingsNavigate} />
          <ThemeToggle />
          <UserMenu onNavigate={handleSettingsNavigate} />
        </div>
      </header>

      <main className="flex-1 overflow-auto discreet-scroll">
        {allTabs.map((tab) => (
          <div
            key={tab.id}
            className={activeTab === tab.id ? "animate-fade-in h-full" : "hidden"}
          >
            {renderTabContent(tab)}
          </div>
        ))}
      </main>
    </div>
  );
}
