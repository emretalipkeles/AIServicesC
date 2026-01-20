import { useState } from "react";
import { 
  Settings, Bot, Users, Database, Bell, Shield, 
  Palette, Globe, ChevronRight, Sparkles, Zap,
  FileText, Key, Mail, Webhook
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SettingsCategory {
  id: string;
  label: string;
  description: string;
  icon: typeof Settings;
  color: string;
  items: { id: string; label: string; icon: typeof Settings }[];
}

const settingsCategories: SettingsCategory[] = [
  {
    id: "ai",
    label: "AI & Agents",
    description: "Configure AI Assistant and knowledge bases",
    icon: Bot,
    color: "from-primary to-primary/70",
    items: [
      { id: "agent-setup", label: "Agent Setup", icon: Bot },
      { id: "knowledge-base", label: "Knowledge Base", icon: FileText },
      { id: "ai-models", label: "AI Models", icon: Sparkles },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Connect external services and APIs",
    icon: Webhook,
    color: "from-blue-500 to-blue-600",
    items: [
      { id: "api-keys", label: "API Keys", icon: Key },
      { id: "webhooks", label: "Webhooks", icon: Webhook },
      { id: "email", label: "Email Settings", icon: Mail },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Team settings and preferences",
    icon: Users,
    color: "from-violet-500 to-violet-600",
    items: [
      { id: "team", label: "Team Members", icon: Users },
      { id: "permissions", label: "Permissions", icon: Shield },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    id: "customization",
    label: "Customization",
    description: "Appearance and branding options",
    icon: Palette,
    color: "from-emerald-500 to-emerald-600",
    items: [
      { id: "branding", label: "Branding", icon: Palette },
      { id: "language", label: "Language", icon: Globe },
      { id: "data", label: "Data & Storage", icon: Database },
    ],
  },
];

interface SettingsMenuProps {
  onNavigate: (settingId: string) => void;
}

export function SettingsMenu({ onNavigate }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const handleItemClick = (itemId: string) => {
    setIsOpen(false);
    onNavigate(itemId);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground transition-all duration-300 group"
          data-testid="button-settings"
          aria-label="Open settings menu"
        >
          <Settings className={`w-[18px] h-[18px] transition-transform duration-500 ${isOpen ? 'rotate-90' : 'group-hover:rotate-45'}`} />
          <span className="sr-only">Settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[480px] p-0 overflow-hidden rounded-xl border-border/50 shadow-xl bg-popover/95 backdrop-blur-xl"
        data-testid="settings-mega-menu"
      >
        <div className="p-4 border-b border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground" data-testid="text-settings-title">Settings</h2>
              <p className="text-sm text-muted-foreground">Customize your Prophix Customer Journey experience</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-2">
          {settingsCategories.map((category) => {
            const CategoryIcon = category.icon;
            const isHovered = hoveredCategory === category.id;
            
            return (
              <div
                key={category.id}
                className="relative"
                onMouseEnter={() => setHoveredCategory(category.id)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <div
                  className={`relative p-4 rounded-xl cursor-pointer transition-colors duration-300 ${
                    isHovered 
                      ? 'bg-muted' 
                      : 'bg-transparent'
                  }`}
                  data-testid={`settings-category-${category.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center flex-shrink-0`}>
                      <CategoryIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground text-sm mb-0.5" data-testid={`text-category-${category.id}`}>
                        {category.label}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {category.description}
                      </p>
                    </div>
                  </div>

                  <div className={`mt-3 space-y-1 transition-all duration-300 ${isHovered ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                    {category.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleItemClick(item.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover-elevate transition-colors duration-200 group/item"
                          data-testid={`settings-item-${item.id}`}
                        >
                          <ItemIcon className="w-4 h-4 opacity-70" />
                          <span className="flex-1 text-left">{item.label}</span>
                          <ChevronRight className="w-3 h-3 opacity-50" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-border/50 bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono">,</kbd> for keyboard shortcuts
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
