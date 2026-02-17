import { cn } from "@/lib/utils";
import prophixLogo from "@assets/Prophix_Logo_small_1768494327727.png";

interface AnimatedThinkingIndicatorProps {
  className?: string;
  agentName?: string;
  statusMessage?: string;
  size?: "sm" | "md" | "lg";
}

export function AnimatedThinkingIndicator({
  className,
  agentName = "Phix Net",
  statusMessage = "Working",
  size = "md",
}: AnimatedThinkingIndicatorProps) {
  const sizeClasses = {
    sm: {
      container: "gap-1.5",
      logo: "w-5 h-5",
      text: "text-xs",
      dots: "text-[10px]",
    },
    md: {
      container: "gap-2",
      logo: "w-6 h-6",
      text: "text-sm",
      dots: "text-xs",
    },
    lg: {
      container: "gap-2.5",
      logo: "w-8 h-8",
      text: "text-base",
      dots: "text-sm",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn("flex items-center", sizes.container, className)}
      data-testid="animated-thinking-indicator"
    >
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 animate-thinking-glow rounded-full" />
        <div className="relative animate-thinking-logo">
          <img
            src={prophixLogo}
            alt={agentName}
            className={cn(sizes.logo, "object-contain relative z-10")}
          />
        </div>
        <div className="absolute inset-0 animate-thinking-ring rounded-full" />
        <div className="absolute animate-thinking-sparkle-1">
          <SparkleIcon className="w-2 h-2 text-primary" />
        </div>
        <div className="absolute animate-thinking-sparkle-2">
          <SparkleIcon className="w-1.5 h-1.5 text-primary/70" />
        </div>
        <div className="absolute animate-thinking-sparkle-3">
          <SparkleIcon className="w-1.5 h-1.5 text-primary/50" />
        </div>
      </div>

      <div className="flex items-center">
        <span className={cn("font-medium text-foreground", sizes.text)}>
          {statusMessage}
        </span>
        <span className={cn("flex ml-0.5", sizes.dots)}>
          <span className="animate-thinking-dot-1">.</span>
          <span className="animate-thinking-dot-2">.</span>
          <span className="animate-thinking-dot-3">.</span>
        </span>
      </div>
    </div>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 0L13.5 8.5L22 10L13.5 11.5L12 20L10.5 11.5L2 10L10.5 8.5L12 0Z" />
    </svg>
  );
}

export function ThinkingBars({
  className,
}: {
  className?: string;
}) {
  return (
    <div 
      className={cn("flex items-end gap-0.5 h-3", className)} 
      data-testid="thinking-bars"
    >
      <div className="animate-thinking-bar-1 w-0.5 h-3 bg-primary rounded-full origin-bottom" />
      <div className="animate-thinking-bar-2 w-0.5 h-3 bg-primary rounded-full origin-bottom" />
      <div className="animate-thinking-bar-3 w-0.5 h-3 bg-primary rounded-full origin-bottom" />
      <div className="animate-thinking-bar-4 w-0.5 h-3 bg-primary rounded-full origin-bottom" />
      <div className="animate-thinking-bar-5 w-0.5 h-3 bg-primary rounded-full origin-bottom" />
    </div>
  );
}

export function ThinkingMessage({
  agentName = "Phix Net",
  statusMessage = "Working",
  className,
}: {
  agentName?: string;
  statusMessage?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 animate-fade-in", className)} data-testid="ai-thinking-message">
      <div className="flex-shrink-0 relative flex items-center justify-center w-6 h-6">
        <div className="absolute inset-0 animate-thinking-glow rounded-full" />
        <div className="relative animate-thinking-logo w-6 h-6 rounded-full flex items-center justify-center overflow-hidden">
          <img
            src={prophixLogo}
            alt={agentName}
            className="w-6 h-6 object-contain relative z-10"
          />
        </div>
        <div className="absolute inset-0 animate-thinking-ring rounded-full" />
        <div className="absolute animate-thinking-sparkle-1">
          <SparkleIcon className="w-1.5 h-1.5 text-primary" />
        </div>
        <div className="absolute animate-thinking-sparkle-2">
          <SparkleIcon className="w-1 h-1 text-primary/70" />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-medium text-sidebar-foreground">
            {agentName}
          </span>
          <div className="flex items-center">
            <span className="text-[10px] text-muted-foreground font-medium animate-thinking-status">
              {statusMessage}
            </span>
            <span className="flex text-[10px] text-muted-foreground font-medium">
              <span className="animate-thinking-dot-1">.</span>
              <span className="animate-thinking-dot-2">.</span>
              <span className="animate-thinking-dot-3">.</span>
            </span>
          </div>
        </div>
        <div className="inline-block px-2.5 py-1.5 assistant-message">
          <ThinkingBars />
        </div>
      </div>
    </div>
  );
}
