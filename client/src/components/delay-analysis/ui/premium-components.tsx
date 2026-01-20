import React, { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  animate?: boolean;
  delay?: number;
}

export function GlassCard({ children, className, animate = true, delay = 0 }: GlassCardProps) {
  const content = (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/50",
        "bg-gradient-to-br from-background/80 to-background/40",
        "backdrop-blur-xl shadow-lg",
        "dark:from-zinc-900/80 dark:to-zinc-900/40",
        "dark:border-zinc-700/50",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );

  if (!animate) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
    >
      {content}
    </motion.div>
  );
}

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  gradient?: "blue" | "purple" | "teal" | "amber";
}

const gradientStyles = {
  blue: "from-blue-500/20 via-blue-400/10 to-transparent dark:from-blue-500/30 dark:via-blue-400/15",
  purple: "from-purple-500/20 via-purple-400/10 to-transparent dark:from-purple-500/30 dark:via-purple-400/15",
  teal: "from-teal-500/20 via-teal-400/10 to-transparent dark:from-teal-500/30 dark:via-teal-400/15",
  amber: "from-amber-500/20 via-amber-400/10 to-transparent dark:from-amber-500/30 dark:via-amber-400/15",
};

const iconBgStyles = {
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  purple: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  teal: "bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400",
  amber: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
};

export function SectionHeader({ icon: Icon, title, description, action, gradient = "blue" }: SectionHeaderProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-t-xl px-6 py-5",
      "bg-gradient-to-r",
      gradientStyles[gradient]
    )}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex items-center justify-center w-12 h-12 rounded-xl",
            "ring-2 ring-white/20 dark:ring-white/10",
            iconBgStyles[gradient]
          )}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "default" | "success" | "warning" | "danger";
}

const colorStyles = {
  default: "from-zinc-500/10 to-transparent text-foreground",
  success: "from-green-500/10 to-transparent text-green-600 dark:text-green-400",
  warning: "from-amber-500/10 to-transparent text-amber-600 dark:text-amber-400",
  danger: "from-red-500/10 to-transparent text-red-600 dark:text-red-400",
};

export function StatCard({ label, value, icon: Icon, color = "default" }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-xl p-4",
        "bg-gradient-to-br border border-border/50",
        "hover:border-border hover:shadow-md transition-all duration-200",
        colorStyles[color]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-background/50">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface HeroHeaderProps {
  title: string;
  subtitle?: string;
  badge?: { label: string; variant: "active" | "inactive" };
  onBack?: () => void;
  actions?: ReactNode;
  stats?: Array<{ label: string; value: string | number; icon?: LucideIcon }>;
}

export function HeroHeader({ title, subtitle, badge, onBack, actions, stats }: HeroHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-6",
        "bg-gradient-to-br from-primary/10 via-background to-background",
        "dark:from-primary/20 dark:via-zinc-900 dark:to-zinc-900",
        "border border-border/50"
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {onBack && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onBack}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-background/80 border border-border/50 hover:bg-background hover:border-border transition-all shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </motion.button>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
                {badge && (
                  <span className={cn(
                    "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold",
                    badge.variant === "active" 
                      ? "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 ring-1 ring-green-500/20"
                      : "bg-zinc-500/10 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400 ring-1 ring-zinc-500/20"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full mr-1.5",
                      badge.variant === "active" ? "bg-green-500" : "bg-zinc-500"
                    )} />
                    {badge.label}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>

        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 * index }}
                className="bg-background/60 backdrop-blur-sm rounded-xl p-4 border border-border/50"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                  {stat.icon && <stat.icon className="w-3.5 h-3.5" />}
                  {stat.label}
                </div>
                <div className="text-xl font-bold mt-1">{stat.value}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface UploadIndicator {
  type: 'schedule' | 'document' | 'analysis';
  percentage?: number;
  isIndeterminate?: boolean;
  count?: number;
}

interface PremiumTabsProps {
  tabs: Array<{ value: string; label: string; icon: LucideIcon }>;
  value: string;
  onChange: (value: string) => void;
  uploadIndicators?: UploadIndicator[];
}

export function PremiumTabs({ tabs, value, onChange, uploadIndicators }: PremiumTabsProps) {
  const activeIndicators = uploadIndicators?.filter(i => i.percentage !== undefined || i.isIndeterminate) || [];
  
  return (
    <div className="flex items-center gap-2 p-1.5 bg-muted/50 rounded-xl border border-border/50">
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        const Icon = tab.icon;
        return (
          <motion.button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-primary rounded-lg shadow-lg"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {tab.label}
            </span>
          </motion.button>
        );
      })}
      
      {activeIndicators.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="ml-auto flex items-center gap-2"
        >
          {activeIndicators.map((indicator, idx) => (
            <CompactUploadIndicator key={idx} {...indicator} />
          ))}
        </motion.div>
      )}
    </div>
  );
}

interface CompactUploadIndicatorProps {
  type: 'schedule' | 'document' | 'analysis';
  percentage?: number;
  isIndeterminate?: boolean;
  count?: number;
}

function CompactUploadIndicator({ type, percentage, isIndeterminate, count }: CompactUploadIndicatorProps) {
  const size = 28;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const colors = {
    schedule: { stroke: '#a855f7', bg: 'rgba(168, 85, 247, 0.2)', text: 'text-purple-500' },
    document: { stroke: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)', text: 'text-blue-500' },
    analysis: { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)', text: 'text-amber-500' },
  };
  
  const color = colors[type];
  const displayLabels = { schedule: 'Schedule', document: 'Document', analysis: 'Analysis' };
  const displayLabel = displayLabels[type];
  
  if (isIndeterminate) {
    return (
      <div 
        className="relative flex items-center justify-center"
        title={`${displayLabel} upload${count ? `: ${count} file${count !== 1 ? 's' : ''}` : ''}`}
      >
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color.bg}
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: 'center' }}
          />
        </svg>
        {count && (
          <span 
            className={cn("absolute text-[9px] font-bold", color.text)}
          >
            {count}
          </span>
        )}
      </div>
    );
  }
  
  const pct = percentage ?? 0;
  const offset = circumference - (pct / 100) * circumference;
  
  return (
    <div 
      className="relative flex items-center justify-center"
      title={`${displayLabel} upload: ${Math.round(pct)}%`}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.bg}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </svg>
      <span 
        className={cn("absolute text-[9px] font-bold", color.text)}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}

interface UploadZoneProps {
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  isDragOver: boolean;
  isUploading: boolean;
  onBrowse: () => void;
  title: string;
  description: string;
  icons?: LucideIcon[];
  acceptedFormats?: string;
}

export function UploadZone({
  onDrop,
  onDragOver,
  onDragLeave,
  isDragOver,
  isUploading,
  onBrowse,
  title,
  description,
  icons,
  acceptedFormats,
}: UploadZoneProps) {
  return (
    <motion.div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      animate={{
        scale: isDragOver ? 1.01 : 1,
        borderColor: isDragOver ? "hsl(var(--primary))" : "hsl(var(--border) / 0.5)",
      }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative overflow-hidden rounded-xl border-2 border-dashed py-5 px-6",
        "bg-gradient-to-b from-muted/30 to-muted/10",
        "hover:border-primary/50 hover:from-muted/40 hover:to-muted/20",
        "transition-colors cursor-pointer group",
        isDragOver && "border-primary bg-primary/5"
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative z-10 flex items-center gap-4">
        <motion.div
          animate={{ y: isDragOver ? -2 : 0 }}
          className="flex items-center gap-2 flex-shrink-0"
        >
          {icons?.map((Icon, index) => (
            <div
              key={index}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg",
                "bg-primary/10 text-primary",
                "ring-1 ring-primary/20"
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
          ))}
        </motion.div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
          {acceptedFormats && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">{acceptedFormats}</p>
          )}
        </div>
        
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onBrowse}
          disabled={isUploading}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg flex-shrink-0",
            "bg-primary text-primary-foreground text-sm font-medium",
            "shadow-md shadow-primary/20",
            "hover:shadow-lg hover:shadow-primary/25",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-shadow"
          )}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Browse Files
        </motion.button>
      </div>
    </motion.div>
  );
}

interface ProgressIndicatorProps {
  stage: string;
  message: string;
  percentage: number;
  details?: {
    current?: number;
    total?: number;
    batchNumber?: number;
    totalBatches?: number;
  };
}

export function ProgressIndicator({ stage, message, percentage, details }: ProgressIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-5 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{percentage}%</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="font-medium">{message}</p>
          {details && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {details.batchNumber && details.totalBatches
                ? `Batch ${details.batchNumber} of ${details.totalBatches}`
                : details.current !== undefined && details.total !== undefined
                  ? `Step ${details.current} of ${details.total}`
                  : stage.replace(/_/g, ' ')
              }
            </p>
          )}
        </div>
      </div>
      <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

interface EnhancedTableProps {
  children: ReactNode;
  className?: string;
}

export function EnhancedTable({ children, className }: EnhancedTableProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border/50 overflow-hidden",
      "bg-gradient-to-b from-background to-muted/20",
      className
    )}>
      {children}
    </div>
  );
}

export const tableHeaderStyles = cn(
  "sticky top-0 z-10",
  "bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100",
  "dark:from-zinc-800 dark:via-zinc-800/95 dark:to-zinc-800",
  "border-b-2 border-primary/20 dark:border-primary/30",
  "shadow-sm"
);

export const tableHeaderCellStyles = cn(
  "text-left p-3 text-xs font-semibold uppercase tracking-wider",
  "text-slate-600 dark:text-zinc-300"
);

export const selectTriggerStyles = cn(
  "bg-background border-2 border-border/80",
  "hover:border-primary/50 hover:bg-accent/30",
  "focus:border-primary focus:ring-2 focus:ring-primary/20",
  "shadow-sm transition-all duration-200",
  "dark:bg-zinc-900 dark:border-zinc-600",
  "dark:hover:border-primary/60 dark:hover:bg-zinc-800"
);

interface TableFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TableFilter({ value, onChange, placeholder = "Search...", className }: TableFilterProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          className="h-4 w-4 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full pl-10 pr-4 py-2 text-sm",
          "rounded-lg border border-border/80",
          "bg-background/50 backdrop-blur-sm",
          "placeholder:text-muted-foreground/60",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50",
          "transition-all duration-200",
          "dark:bg-zinc-900/50 dark:border-zinc-700"
        )}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
