import { useState, useCallback, useEffect, useRef } from "react";
import { AIChatPanel } from "@/components/ai-chat-panel";
import { TabbedContent } from "@/components/tabbed-content";
import { TabProvider } from "@/contexts/tab-context";
import { GripVertical, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Home() {
  const [panelWidth, setPanelWidth] = useState(450);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCollapsed) return;
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const maxWidth = Math.floor(window.innerWidth / 2);
      const newWidth = Math.min(Math.max(e.clientX, 450), maxWidth);
      setPanelWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  return (
    <TabProvider>
      <TooltipProvider>
        <div className="flex h-screen w-full overflow-hidden bg-background">
          <aside 
            className="flex-shrink-0 theme-transition relative overflow-hidden transition-all duration-300 ease-in-out"
            style={{ width: isCollapsed ? '0px' : `${panelWidth}px` }}
          >
            <div 
              className="h-full"
              style={{ width: `${panelWidth}px`, opacity: isCollapsed ? 0 : 1, transition: 'opacity 200ms ease-in-out' }}
            >
              <AIChatPanel onCollapse={toggleCollapse} />
            </div>
          </aside>
          
          {isCollapsed ? (
            <div className="flex-shrink-0 border-r border-border bg-background">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleCollapse}
                    className="h-10 w-10 m-1 hover:bg-primary/10"
                  >
                    <PanelLeftOpen className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Show AI Assistant</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div 
              className={`w-1 flex-shrink-0 cursor-col-resize flex items-center justify-center group transition-colors ${
                isDragging ? 'bg-primary/30' : 'bg-border hover:bg-primary/20'
              }`}
              onMouseDown={handleMouseDown}
              data-testid="resize-handle"
            >
              <div className={`flex h-8 w-4 items-center justify-center rounded-sm border transition-colors ${
                isDragging ? 'bg-primary border-primary' : 'bg-muted border-border'
              }`}>
                <GripVertical className={`h-3 w-3 transition-colors ${isDragging ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              </div>
            </div>
          )}
          
          <main className="flex-1 min-w-0 overflow-hidden">
            <TabbedContent />
          </main>
        </div>
      </TooltipProvider>
    </TabProvider>
  );
}
