import { useState } from "react";
import { Plus, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AddMenuItem {
  id: string;
  label: string;
  description: string;
  icon: typeof Plus;
}

const menuItems: AddMenuItem[] = [
  {
    id: "delay-analysis",
    label: "Delay Analysis",
    description: "Analyze contractor-caused delays from construction documentation",
    icon: Activity,
  },
];

interface AddMenuProps {
  onNavigate: (itemId: string) => void;
}

export function AddMenu({ onNavigate }: AddMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

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
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-add-menu"
          aria-label="Add new item"
        >
          <Plus className={`w-[18px] h-[18px] transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[320px] p-2 rounded-xl border-border/50 shadow-xl bg-popover/95 backdrop-blur-xl"
        data-testid="add-menu-dropdown"
      >
        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="w-full flex items-start gap-3 p-3 rounded-lg text-left hover:bg-muted transition-colors duration-200 group"
                data-testid={`add-menu-item-${item.id}`}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-foreground">
                    {item.label}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
