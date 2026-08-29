import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface BidItemOption {
  itemNo: number;
  description: string | null;
}

interface BidItemComboboxProps {
  items: BidItemOption[];
  value: number | null;
  onChange: (itemNo: number) => void;
  placeholder?: string;
}

/**
 * Searchable replacement for a plain <Select> of bid items -- the full list can run into the
 * hundreds, which made a scroll-only dropdown slow to use. The popover list is capped at a fixed
 * height (~7 rows) and scrolls internally rather than growing to fit every item.
 */
export function BidItemCombobox({ items, value, onChange, placeholder = "Select a bid item" }: BidItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const activeItem = items.find((i) => i.itemNo === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-background/50 font-normal"
        >
          <span className="truncate">
            {activeItem ? `${activeItem.itemNo} — ${activeItem.description ?? "Unnamed item"}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search bid items…" />
          <CommandList className="max-h-56">
            <CommandEmpty>No bid item matches.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.itemNo}
                  value={`${item.itemNo} ${item.description ?? ""}`}
                  onSelect={() => {
                    onChange(item.itemNo);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", item.itemNo === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    {item.itemNo} — {item.description ?? "Unnamed item"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
