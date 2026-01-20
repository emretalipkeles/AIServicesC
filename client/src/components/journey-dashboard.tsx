import { useQuery } from "@tanstack/react-query";
import { 
  Rocket, Users, ArrowRight, TrendingUp, Clock, 
  CheckCircle2, Circle, Target, Sparkles, Star,
  Flag, Trophy, Compass, MapPin, Zap
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Journey, Client } from "@shared/schema";

interface JourneyStage {
  id: string;
  name: string;
  icon: typeof Compass;
  description: string;
  status: "completed" | "current" | "upcoming";
  progress?: number;
}

const journeyStages: JourneyStage[] = [
  { id: "discovery", name: "Discovery", icon: Compass, description: "Understanding customer needs", status: "completed" },
  { id: "engagement", name: "Engagement", icon: Target, description: "Building meaningful connections", status: "completed" },
  { id: "conversion", name: "Conversion", icon: Zap, description: "Turning interest into action", status: "current", progress: 65 },
  { id: "retention", name: "Retention", icon: Star, description: "Creating lasting relationships", status: "upcoming" },
  { id: "advocacy", name: "Advocacy", icon: Trophy, description: "Transforming customers into champions", status: "upcoming" },
];

function JourneyPath() {
  const currentStageIndex = journeyStages.findIndex(s => s.status === "current");

  return (
    <div className="relative py-12" data-testid="journey-path-container">
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-primary/5 via-primary/20 to-primary/5"
          style={{ transform: 'translateY(-50%)' }}
        />
        <div 
          className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-transparent journey-path-glow"
          style={{ 
            transform: 'translateY(-50%)',
            width: `${((currentStageIndex + (journeyStages[currentStageIndex]?.progress || 0) / 100) / journeyStages.length) * 100}%`,
          }}
        />
        <div className="journey-particles" />
      </div>

      <div className="relative flex justify-between items-center px-8 gap-4">
        {journeyStages.map((stage, index) => {
          const Icon = stage.icon;
          const isCompleted = stage.status === "completed";
          const isCurrent = stage.status === "current";
          const isUpcoming = stage.status === "upcoming";

          return (
            <div 
              key={stage.id}
              className="flex flex-col items-center group"
              style={{ animationDelay: `${index * 100}ms` }}
              data-testid={`journey-stage-${stage.id}`}
            >
              <div 
                className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isCompleted 
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30' 
                    : isCurrent 
                    ? 'bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/50 scale-110' 
                    : 'bg-muted border-2 border-border'
                }`}
                style={isCurrent ? {
                  animation: 'pulse-glow 2s ease-in-out infinite',
                  boxShadow: '0 0 30px hsl(var(--primary) / 0.6), 0 0 60px hsl(var(--primary) / 0.3)'
                } : undefined}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-7 h-7 text-white" />
                ) : isCurrent ? (
                  <Icon className="w-7 h-7 text-white animate-pulse" />
                ) : (
                  <Icon className="w-6 h-6 text-muted-foreground" />
                )}
                
                {isCurrent && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                    <div className="absolute -inset-2 rounded-full border-2 border-primary/30 animate-pulse" />
                  </>
                )}
              </div>

              <div className={`mt-4 text-center transition-all duration-300 ${isCurrent ? 'scale-105' : ''}`}>
                <h4 className={`font-semibold text-sm ${
                  isCompleted ? 'text-emerald-500' : isCurrent ? 'text-primary' : 'text-muted-foreground'
                }`} data-testid={`stage-name-${stage.id}`}>
                  {stage.name}
                </h4>
                <p className="text-xs text-muted-foreground/70 mt-1 h-8 max-w-24 line-clamp-2" data-testid={`stage-desc-${stage.id}`}>
                  {stage.description}
                </p>
              </div>

              {isCurrent && stage.progress !== undefined && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${stage.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-primary" data-testid={`stage-progress-${stage.id}`}>{stage.progress}%</span>
                </div>
              )}

              {index < journeyStages.length - 1 && (
                <div className="absolute left-full top-8 w-full h-0.5 -ml-8" style={{ width: 'calc(100% - 4rem)' }}>
                  {isCompleted && (
                    <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-emerald-500 to-emerald-400 opacity-50" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneCard({ title, value, icon: Icon, trend, color }: {
  title: string;
  value: string;
  icon: typeof TrendingUp;
  trend?: string;
  color: string;
}) {
  return (
    <div 
      className={`relative overflow-hidden rounded-xl p-5 ${color} transition-transform duration-300 hover:scale-[1.02]`}
      data-testid={`milestone-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 opacity-10">
        <Icon className="w-full h-full" />
      </div>
      <div className="relative z-10">
        <Icon className="w-5 h-5 mb-3 opacity-80" />
        <p className="text-3xl font-bold mb-1" data-testid={`milestone-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
        <p className="text-sm opacity-80" data-testid={`milestone-label-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-3 h-3" />
            <span className="text-xs font-medium">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatsData {
  activeJourneys: number;
  completedJourneys: number;
  totalClients: number;
  averageProgress: number;
}

interface JourneyWithClient extends Journey {
  clientName?: string;
}

function JourneyItemSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30">
      <Skeleton className="w-12 h-12 rounded-xl" />
      <div className="flex-1">
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-8 w-20 rounded-full" />
    </div>
  );
}

export function JourneyDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ["/api/stats"],
  });

  const { data: journeys, isLoading: journeysLoading } = useQuery<Journey[]>({
    queryKey: ["/api/journeys"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const journeysWithClients: JourneyWithClient[] = (journeys || []).map(journey => ({
    ...journey,
    clientName: clients?.find(c => c.id === journey.clientId)?.company || "Unknown Client",
  }));

  const formatStatus = (status: string) => {
    return status.split("_").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  return (
    <div className="p-6 space-y-8">
      <div className="text-center mb-8 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Sparkles className="w-4 h-4" />
          <span data-testid="text-dashboard-badge">AI-Powered Journey Mapping</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-dashboard-title">
          Customer Journey Dashboard
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto" data-testid="text-dashboard-subtitle">
          Visualize, optimize, and transform your customer experience at every touchpoint
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <Card 
          className="group relative overflow-hidden p-6 cursor-pointer action-card-glow transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(6 72% 45%) 100%)",
          }}
          data-testid="card-new-journey"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute inset-0 shimmer-effect" />
          <div className="absolute -right-8 -bottom-8 w-32 h-32 opacity-10 group-hover:opacity-20 transition-opacity duration-500 group-hover:scale-110 transform">
            <Rocket className="w-full h-full text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-5 group-hover:bg-white/30 transition-all duration-300 group-hover:scale-110">
              <Rocket className="w-7 h-7 text-white group-hover:animate-bounce" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" data-testid="text-new-journey-title">Start New Journey</h2>
            <p className="text-white/80 mb-5 text-sm" data-testid="text-new-journey-desc">
              Create AI-powered customer journeys with intelligent suggestions and templates
            </p>
            <Button 
              variant="outline" 
              className="bg-white/20 border-white/30 text-white backdrop-blur-sm group-hover:shadow-lg group-hover:shadow-white/20 transition-all duration-300"
              data-testid="button-get-started"
            >
              <span data-testid="text-cta-get-started">Get Started</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>
          </div>
        </Card>

        <Card 
          className="group relative overflow-hidden p-6 cursor-pointer action-card-glow transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1"
          style={{
            background: "linear-gradient(135deg, hsl(220 60% 50%) 0%, hsl(250 50% 40%) 100%)",
          }}
          data-testid="card-select-client"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute inset-0 shimmer-effect" />
          <div className="absolute -right-8 -bottom-8 w-32 h-32 opacity-10 group-hover:opacity-20 transition-opacity duration-500 group-hover:scale-110 transform">
            <Users className="w-full h-full text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-5 group-hover:bg-white/30 transition-all duration-300 group-hover:scale-110">
              <Users className="w-7 h-7 text-white group-hover:animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" data-testid="text-select-client-title">Select Client</h2>
            <p className="text-white/80 mb-5 text-sm" data-testid="text-select-client-desc">
              Continue existing journeys or view progress of ongoing customer projects
            </p>
            <Button 
              variant="outline" 
              className="bg-white/20 border-white/30 text-white backdrop-blur-sm group-hover:shadow-lg group-hover:shadow-white/20 transition-all duration-300"
              data-testid="button-view-clients"
            >
              <span data-testid="text-cta-view-clients">View Clients</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        {statsLoading ? (
          <>
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </>
        ) : (
          <>
            <MilestoneCard
              title="Active Journeys"
              value={stats?.activeJourneys.toString() || "0"}
              icon={Flag}
              trend="+12% this month"
              color="bg-gradient-to-br from-primary/20 to-primary/5 text-primary"
            />
            <MilestoneCard
              title="Total Clients"
              value={stats?.totalClients.toString() || "0"}
              icon={Users}
              trend="+8% this month"
              color="bg-gradient-to-br from-blue-500/20 to-blue-500/5 text-blue-500 dark:text-blue-400"
            />
            <MilestoneCard
              title="Success Rate"
              value={`${stats?.averageProgress || 0}%`}
              icon={Trophy}
              trend="+15% this month"
              color="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500"
            />
          </>
        )}
      </div>

      <Card className="p-6 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground" data-testid="text-recent-journeys-title">Active Journeys</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-recent-journeys-subtitle">Track your customer journey progress</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-primary" data-testid="button-view-all-journeys">
            View All
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="space-y-3">
          {journeysLoading ? (
            <>
              <JourneyItemSkeleton />
              <JourneyItemSkeleton />
              <JourneyItemSkeleton />
            </>
          ) : journeysWithClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-journeys-state">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-4">
                <Compass className="w-8 h-8 text-muted-foreground" />
              </div>
              <h4 className="font-medium text-foreground mb-2" data-testid="text-empty-journeys-title">No active journeys</h4>
              <p className="text-sm text-muted-foreground max-w-xs" data-testid="text-empty-journeys-description">
                Start a new journey to begin mapping your customer experience
              </p>
            </div>
          ) : (
            journeysWithClients.map((journey, index) => (
              <div
                key={journey.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 transition-colors duration-200"
                data-testid={`journey-item-${index}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  journey.status === "completed" 
                    ? "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5" 
                    : journey.status === "in_progress"
                    ? "bg-gradient-to-br from-primary/20 to-primary/5"
                    : "bg-gradient-to-br from-amber-500/20 to-amber-500/5"
                }`}>
                  {journey.status === "completed" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : journey.status === "in_progress" ? (
                    <Circle className="w-5 h-5 text-primary animate-pulse" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground truncate" data-testid={`journey-name-${index}`}>{journey.name}</h4>
                  <p className="text-sm text-muted-foreground" data-testid={`journey-client-${index}`}>{journey.clientName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                      <div
                        className={`h-full rounded-full transition-all ${
                          journey.status === "completed" ? "bg-emerald-500" : "bg-primary"
                        }`}
                        style={{ width: `${journey.progress}%` }}
                        data-testid={`journey-progress-${index}`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{journey.progress}%</span>
                  </div>
                  <span
                    className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                      journey.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : journey.status === "in_progress"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                    data-testid={`journey-status-${index}`}
                  >
                    {formatStatus(journey.status)}
                  </span>
                  <Button variant="ghost" size="icon" className="text-muted-foreground" data-testid={`button-view-journey-${index}`}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="relative overflow-hidden p-6 bg-gradient-to-br from-card via-card to-muted/30 animate-fade-in-up" style={{ animationDelay: "400ms" }}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70">
              <MapPin className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground" data-testid="text-journey-path-title">Your Journey Progress</h2>
              <p className="text-sm text-muted-foreground" data-testid="text-journey-path-subtitle">Current stage: Conversion</p>
            </div>
          </div>
          <JourneyPath />
        </div>
      </Card>
    </div>
  );
}
