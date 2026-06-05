import "@xyflow/react/dist/style.css";

import {
  Activity,
  BarChart3,
  Clock3,
  Download,
  GitBranch,
  FilePenLine,
  ExternalLink,
  FileText,
  Gauge,
  Newspaper,
  PlayCircle,
  RefreshCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type OnSelectionChangeParams
} from "@xyflow/react";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

type Agent = {
  id: string;
  name: string;
  type: string;
  goals: string[];
  capabilities: Record<string, number>;
};

type Relation = {
  source: string;
  target: string;
  friendliness: number;
  trade_dependency: number;
  military_tension: number;
  summary: string;
};

type SeedStatus = {
  schema_version?: string;
  seed_version?: string;
  seed_imported_at?: string;
  agent_count: number;
  relation_count: number;
};

type WorldState = {
  nodes: Agent[];
  edges: Relation[];
  seed_status: SeedStatus;
};

type NewsSource = {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  last_fetched_at: string | null;
  last_fetch_status: "never" | "ok" | "error";
  last_error: string | null;
};

type NewsItem = {
  id: number;
  source_id: string | null;
  title: string;
  source: string;
  url: string;
  published_at: string | null;
  summary: string | null;
  fetched_at: string;
  fingerprint: string;
  extraction_status: string;
};

type NewsFetchResult = {
  sources_checked: number;
  inserted: number;
  duplicates: number;
  results: Array<{
    source_id: string;
    source: string;
    status: "ok" | "error";
    inserted: number;
    duplicates: number;
    error: string | null;
  }>;
  news: NewsItem[];
};

type EventItem = {
  id: number;
  title: string;
  actor: string;
  targets: string[];
  action: string;
  domain: string;
  intensity: number;
  summary: string;
  occurred_at: string | null;
  needs_review: boolean;
  source_news_ids: number[];
  created_at: string;
  updated_at: string;
};

type EventExtractionResult = {
  created: number;
  events: EventItem[];
  news: NewsItem[];
};

type SimulationDecision = {
  id: number;
  simulation_id: number;
  branch_id: number | null;
  round: number;
  agent_id: string;
  perception: string;
  goals_considered: string[];
  options: Array<{
    action: string;
    score: number;
    rationale: string;
  }>;
  decision: string;
  confidence: number;
  citations: Array<Record<string, unknown>>;
  created_at: string;
};

type InterventionItem = {
  id: number;
  simulation_id: number;
  branch_id: number | null;
  raw_text: string;
  parsed_payload: {
    assumption: string;
    actors: string[];
    targets: string[];
    domain: string;
    policy_shift: string;
    action: string;
    from_round: number;
    intensity_delta: number;
    expected_effect: string;
    suggested_branch_name: string;
    requires_confirmation: boolean;
  };
  status: string;
  created_at: string;
};

type SimulationBranch = {
  id: number;
  simulation_id: number;
  parent_branch_id: number | null;
  name: string;
  from_round: number;
  intervention_id: number;
  created_at: string;
  decisions: SimulationDecision[];
};

type SimulationBranchesPayload = {
  simulation_id: number;
  original: {
    id: null;
    name: string;
    from_round: number;
    decisions: SimulationDecision[];
  };
  branches: SimulationBranch[];
  interventions: InterventionItem[];
};

type SimulationItem = {
  id: number;
  title: string;
  source_event_id: number;
  rounds: number;
  status: string;
  input_snapshot: {
    event?: EventItem;
    agents?: Agent[];
    rounds?: number;
    mode?: string;
  };
  participant_agent_ids: string[];
  decisions: SimulationDecision[];
  branches: SimulationBranch[];
  interventions: InterventionItem[];
  created_at: string;
  updated_at: string;
};

type LlmStatus = {
  provider: "mock" | "openai" | "deepseek";
  mode: "mock" | "llm";
  configured: boolean;
  model: string | null;
  base_url: string | null;
  has_api_key: boolean;
};

type RuntimeStatus = {
  status: "ok" | "degraded";
  service: string;
  api: {
    host: string;
    port: number;
  };
  database: {
    url: string;
    sqlite_path: string | null;
    exists: boolean;
    reachable: boolean;
    error?: string;
  };
  seed_status: SeedStatus;
  news_sources: {
    count: number;
  };
  llm: LlmStatus;
  checks: Record<string, boolean>;
};

type ReportItem = {
  id: number;
  simulation_id: number;
  title: string;
  event_summary: {
    title: string;
    actor: string;
    targets: string[];
    action: string;
    domain: string;
    intensity: number;
    summary: string;
    occurred_at: string | null;
  };
  key_judgments: string[];
  agent_responses: Array<{
    agent_id: string;
    latest_round: number;
    decision: string;
    confidence: number;
    goals_considered: string[];
  }>;
  timeline: Array<{
    round: number;
    agent_id: string;
    branch: string;
    perception: string;
    decision: string;
    confidence: number;
  }>;
  risks: Array<{
    name: string;
    level: "Low" | "Medium" | "High";
    probability: number;
    uncertainty: "Low" | "Medium" | "High";
    rationale: string;
  }>;
  key_variables: Array<{
    name: string;
    value: string;
    assessment: string;
  }>;
  source_links: Array<{
    type: string;
    id: number | null;
    title: string;
    source: string;
    url: string | null;
  }>;
  markdown: string;
  created_at: string;
  updated_at: string;
};

type DetailSelection =
  | { type: "agent"; agent: Agent }
  | { type: "relation"; relation: Relation }
  | null;

const navItems = [
  { label: "态势盘", icon: BarChart3 },
  { label: "新闻事件", icon: Newspaper },
  { label: "推演", icon: PlayCircle },
  { label: "报告", icon: FileText },
  { label: "设置", icon: Settings }
];

const riskItems = [
  { name: "Trade escalation", level: "High", probability: 58, uncertainty: "Medium" },
  { name: "Regional security spillover", level: "Medium", probability: 41, uncertainty: "High" },
  { name: "Energy market disruption", level: "Medium", probability: 37, uncertainty: "Medium" }
];

const keyVariables = [
  { name: "Alliance cohesion", value: "Stable", trend: "+2" },
  { name: "Technology restrictions", value: "Rising", trend: "+8" },
  { name: "Diplomatic bandwidth", value: "Constrained", trend: "-4" }
];

const recentSimulations = [
  { title: "Export controls response", rounds: 3, status: "Ready to replay" },
  { title: "Energy corridor disruption", rounds: 4, status: "Seed scenario" }
];

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

function relationColor(relation: Relation) {
  if (relation.military_tension >= 0.7 || relation.friendliness <= -0.5) {
    return "#b42318";
  }
  if (relation.friendliness >= 0.55) {
    return "#2d6a36";
  }
  return "#b7791f";
}

function agentColor(type: string) {
  const colors: Record<string, string> = {
    country: "#1f5c61",
    bloc: "#5b5fc7",
    alliance: "#7a4f01",
    institution: "#56616f"
  };
  return colors[type] ?? "#384250";
}

function formatCapabilityName(name: string) {
  return name.replaceAll("_", " ");
}

export function App() {
  const [activePage, setActivePage] = useState("态势盘");
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [isLoadingWorldState, setIsLoadingWorldState] = useState(true);
  const [worldStateError, setWorldStateError] = useState<string | null>(null);
  const [detailSelection, setDetailSelection] = useState<DetailSelection>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsSources, setNewsSources] = useState<NewsSource[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(true);
  const [isFetchingNews, setIsFetchingNews] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [lastFetchResult, setLastFetchResult] = useState<NewsFetchResult | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isExtractingEvents, setIsExtractingEvents] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [simulations, setSimulations] = useState<SimulationItem[]>([]);
  const [activeSimulation, setActiveSimulation] = useState<SimulationItem | null>(null);
  const [activeBranches, setActiveBranches] = useState<SimulationBranchesPayload | null>(null);
  const [isCreatingSimulation, setIsCreatingSimulation] = useState(false);
  const [isParsingIntervention, setIsParsingIntervention] = useState(false);
  const [isConfirmingIntervention, setIsConfirmingIntervention] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [activeReport, setActiveReport] = useState<ReportItem | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  async function loadWorldState() {
    setIsLoadingWorldState(true);
    setWorldStateError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/world-state`);
      if (!response.ok) {
        throw new Error(`World state request failed: ${response.status}`);
      }
      const nextWorldState = (await response.json()) as WorldState;
      setWorldState(nextWorldState);
      setDetailSelection((current) => {
        if (current || nextWorldState.nodes.length === 0) {
          return current;
        }
        return { type: "agent", agent: nextWorldState.nodes[0] };
      });
    } catch (error) {
      setWorldStateError(error instanceof Error ? error.message : "Unable to load world state");
    } finally {
      setIsLoadingWorldState(false);
    }
  }

  async function resetSeedData() {
    setWorldStateError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/world-state/reset-seed`, { method: "POST" });
      if (!response.ok) {
        throw new Error(`Seed reset failed: ${response.status}`);
      }
      setDetailSelection(null);
      await loadWorldState();
    } catch (error) {
      setWorldStateError(error instanceof Error ? error.message : "Unable to reset seed data");
    }
  }

  async function loadNewsData() {
    setIsLoadingNews(true);
    setNewsError(null);
    try {
      const [newsResponse, sourcesResponse, eventsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/news`),
        fetch(`${apiBaseUrl}/api/news/sources`),
        fetch(`${apiBaseUrl}/api/events`)
      ]);
      if (!newsResponse.ok) {
        throw new Error(`News request failed: ${newsResponse.status}`);
      }
      if (!sourcesResponse.ok) {
        throw new Error(`News sources request failed: ${sourcesResponse.status}`);
      }
      if (!eventsResponse.ok) {
        throw new Error(`Events request failed: ${eventsResponse.status}`);
      }
      setNewsItems((await newsResponse.json()) as NewsItem[]);
      setNewsSources((await sourcesResponse.json()) as NewsSource[]);
      setEvents((await eventsResponse.json()) as EventItem[]);
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : "Unable to load news data");
    } finally {
      setIsLoadingNews(false);
    }
  }

  async function loadSimulations() {
    setSimulationError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/simulations`);
      if (!response.ok) {
        throw new Error(`Simulations request failed: ${response.status}`);
      }
      const nextSimulations = (await response.json()) as SimulationItem[];
      setSimulations(nextSimulations);
      if (!activeSimulation && nextSimulations.length > 0) {
        const detailResponse = await fetch(`${apiBaseUrl}/api/simulations/${nextSimulations[0].id}`);
        if (detailResponse.ok) {
          const simulation = (await detailResponse.json()) as SimulationItem;
          setActiveSimulation(simulation);
          await loadBranches(simulation.id);
        }
      }
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Unable to load simulations");
    }
  }

  async function loadBranches(simulationId: number) {
    const response = await fetch(`${apiBaseUrl}/api/simulations/${simulationId}/branches`);
    if (!response.ok) {
      throw new Error(`Branches request failed: ${response.status}`);
    }
    setActiveBranches((await response.json()) as SimulationBranchesPayload);
  }

  async function loadLlmStatus() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/llm/status`);
      if (!response.ok) {
        throw new Error(`LLM status request failed: ${response.status}`);
      }
      setLlmStatus((await response.json()) as LlmStatus);
    } catch {
      setLlmStatus({
        provider: "mock",
        mode: "mock",
        configured: false,
        model: null,
        base_url: null,
        has_api_key: false
      });
    }
  }

  async function loadRuntimeStatus() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/runtime/status`);
      if (!response.ok) {
        throw new Error(`Runtime status request failed: ${response.status}`);
      }
      setRuntimeStatus((await response.json()) as RuntimeStatus);
    } catch {
      setRuntimeStatus(null);
    }
  }

  async function fetchLatestNews() {
    setIsFetchingNews(true);
    setNewsError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/news/fetch`, { method: "POST" });
      if (!response.ok) {
        throw new Error(`News fetch failed: ${response.status}`);
      }
      const result = (await response.json()) as NewsFetchResult;
      setLastFetchResult(result);
      setNewsItems(result.news);
      const sourcesResponse = await fetch(`${apiBaseUrl}/api/news/sources`);
      if (sourcesResponse.ok) {
        setNewsSources((await sourcesResponse.json()) as NewsSource[]);
      }
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : "Unable to fetch news");
    } finally {
      setIsFetchingNews(false);
    }
  }

  async function toggleNewsSource(sourceId: string, enabled: boolean) {
    setNewsError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/news/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) {
        throw new Error(`News source update failed: ${response.status}`);
      }
      const updatedSource = (await response.json()) as NewsSource;
      setNewsSources((sources) =>
        sources.map((source) => (source.id === updatedSource.id ? updatedSource : source))
      );
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : "Unable to update news source");
    }
  }

  async function extractEvents(newsIds: number[]) {
    setIsExtractingEvents(true);
    setEventError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/news/extract-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ news_ids: newsIds })
      });
      if (!response.ok) {
        throw new Error(`Event extraction failed: ${response.status}`);
      }
      const result = (await response.json()) as EventExtractionResult;
      setEvents((currentEvents) => {
        const existingIds = new Set(result.events.map((event) => event.id));
        return [...result.events, ...currentEvents.filter((event) => !existingIds.has(event.id))];
      });
      setNewsItems(result.news);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "Unable to extract event");
    } finally {
      setIsExtractingEvents(false);
    }
  }

  async function saveEvent(eventId: number, updates: Partial<EventItem>) {
    setEventError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error(`Event update failed: ${response.status}`);
      }
      const updatedEvent = (await response.json()) as EventItem;
      setEvents((currentEvents) =>
        currentEvents.map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
      );
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "Unable to save event");
    }
  }

  async function createSimulation(eventId: number, agentIds: string[], rounds: number) {
    setIsCreatingSimulation(true);
    setSimulationError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/simulations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, agent_ids: agentIds, rounds })
      });
      if (!response.ok) {
        throw new Error(`Simulation creation failed: ${response.status}`);
      }
      const simulation = (await response.json()) as SimulationItem;
      if ("status" in simulation && simulation.status === "not_found") {
        throw new Error("Selected event was not found");
      }
      setActiveSimulation(simulation);
      await loadBranches(simulation.id);
      setSimulations((currentSimulations) => {
        const existingIds = new Set([simulation.id]);
        return [simulation, ...currentSimulations.filter((item) => !existingIds.has(item.id))];
      });
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Unable to create simulation");
    } finally {
      setIsCreatingSimulation(false);
    }
  }

  async function parseSimulationIntervention(simulationId: number, text: string, fromRound: number) {
    setIsParsingIntervention(true);
    setSimulationError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/simulations/${simulationId}/interventions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from_round: fromRound })
      });
      if (!response.ok) {
        throw new Error(`Intervention parsing failed: ${response.status}`);
      }
      return (await response.json()) as InterventionItem;
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Unable to parse intervention");
      return null;
    } finally {
      setIsParsingIntervention(false);
    }
  }

  async function confirmSimulationIntervention(simulationId: number, interventionId: number, branchName: string) {
    setIsConfirmingIntervention(true);
    setSimulationError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/simulations/${simulationId}/interventions/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervention_id: interventionId, branch_name: branchName })
      });
      if (!response.ok) {
        throw new Error(`Branch creation failed: ${response.status}`);
      }
      const branch = (await response.json()) as SimulationBranch;
      await loadBranches(simulationId);
      const detailResponse = await fetch(`${apiBaseUrl}/api/simulations/${simulationId}`);
      if (detailResponse.ok) {
        setActiveSimulation((await detailResponse.json()) as SimulationItem);
      }
      return branch;
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Unable to create branch");
      return null;
    } finally {
      setIsConfirmingIntervention(false);
    }
  }

  async function generateReport(simulationId: number) {
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/reports/${simulationId}`);
      if (!response.ok) {
        throw new Error(`Report request failed: ${response.status}`);
      }
      const report = (await response.json()) as ReportItem | { status: string };
      if ("status" in report && report.status === "not_found") {
        throw new Error("Selected simulation was not found");
      }
      setActiveReport(report as ReportItem);
      setReportMarkdown((report as ReportItem).markdown);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Unable to generate report");
    } finally {
      setIsLoadingReport(false);
    }
  }

  async function exportReportMarkdown(simulationId: number) {
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/reports/${simulationId}/markdown`);
      if (!response.ok) {
        throw new Error(`Markdown request failed: ${response.status}`);
      }
      const payload = (await response.json()) as { markdown?: string; status?: string };
      if (payload.status === "not_found" || !payload.markdown) {
        throw new Error("Selected simulation was not found");
      }
      setReportMarkdown(payload.markdown);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Unable to export Markdown");
    } finally {
      setIsLoadingReport(false);
    }
  }

  useEffect(() => {
    void loadWorldState();
    void loadNewsData();
    void loadSimulations();
    void loadLlmStatus();
    void loadRuntimeStatus();
  }, []);

  const agentById = useMemo(() => {
    return new Map((worldState?.nodes ?? []).map((agent) => [agent.id, agent]));
  }, [worldState]);

  const flowNodes = useMemo<Node[]>(() => {
    const agents = worldState?.nodes ?? [];
    const positions: Record<string, { x: number; y: number }> = {
      usa: { x: 70, y: 90 },
      nato: { x: 320, y: 40 },
      eu: { x: 560, y: 120 },
      china: { x: 120, y: 330 },
      russia: { x: 410, y: 330 },
      un: { x: 680, y: 300 }
    };

    return agents.map((agent, index) => ({
      id: agent.id,
      position: positions[agent.id] ?? { x: 120 + index * 120, y: 180 },
      data: { label: `${agent.name}\n${agent.type}` },
      style: {
        width: 132,
        border: `2px solid ${agentColor(agent.type)}`,
        borderRadius: 8,
        background: "#ffffff",
        color: "#14213d",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.35,
        padding: 12,
        textAlign: "left",
        whiteSpace: "pre-line"
      }
    }));
  }, [worldState]);

  const flowEdges = useMemo<Edge[]>(() => {
    return (worldState?.edges ?? []).map((relation) => ({
      id: `${relation.source}-${relation.target}`,
      source: relation.source,
      target: relation.target,
      label: relation.military_tension >= 0.7 ? "tension" : relation.friendliness >= 0.55 ? "aligned" : "mixed",
      style: {
        stroke: relationColor(relation),
        strokeWidth: 1 + relation.trade_dependency * 3
      },
      labelStyle: { fill: "#384250", fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.85 },
      animated: relation.military_tension >= 0.75
    }));
  }, [worldState]);

  const topCapabilityAgents = useMemo(() => {
    return [...(worldState?.nodes ?? [])]
      .map((agent) => ({
        ...agent,
        averageCapability:
          Object.values(agent.capabilities).reduce((total, value) => total + value, 0) /
          Object.values(agent.capabilities).length
      }))
      .sort((left, right) => right.averageCapability - left.averageCapability)
      .slice(0, 3);
  }, [worldState]);

  const onSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      const selectedNode = nodes[0];
      if (selectedNode) {
        const agent = agentById.get(selectedNode.id);
        if (agent) {
          setDetailSelection({ type: "agent", agent });
        }
        return;
      }

      const selectedEdge = edges[0];
      if (selectedEdge) {
        const relation = worldState?.edges.find(
          (edge) => `${edge.source}-${edge.target}` === selectedEdge.id
        );
        if (relation) {
          setDetailSelection({ type: "relation", relation });
        }
      }
    },
    [agentById, worldState]
  );

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="GlobalSim navigation">
        <div className="brand">
          <ShieldCheck aria-hidden="true" />
          <span>GlobalSim</span>
        </div>
        <nav>
          {navItems.map((item) => (
            <Button
              key={item.label}
              className="nav-button"
              variant={item.label === activePage ? "secondary" : "ghost"}
              onClick={() => setActivePage(item.label)}
            >
              <item.icon aria-hidden="true" />
              {item.label}
            </Button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Global situation workspace</p>
            <h1>{activePage}</h1>
          </div>
          <div className="topbar-status" data-testid="global-status-bar">
            <span>Last update: seed</span>
            <span>
              News fetch: {lastFetchResult ? `${lastFetchResult.inserted} new` : isFetchingNews ? "running" : "idle"}
            </span>
            <span>Simulations: {simulations.length}</span>
            <span>{worldState ? `${worldState.seed_status.agent_count} agents` : "Loading"}</span>
          </div>
        </header>

        {activePage === "态势盘" ? (
          <SituationDashboard
            detailSelection={detailSelection}
            edges={flowEdges}
            isLoading={isLoadingWorldState}
            nodes={flowNodes}
            onSelectionChange={onSelectionChange}
            relationCount={worldState?.edges.length ?? 0}
            topCapabilityAgents={topCapabilityAgents}
            worldState={worldState}
            worldStateError={worldStateError}
          />
        ) : activePage === "新闻事件" ? (
          <NewsEventsPage
            eventError={eventError}
            events={events}
            extractEvents={extractEvents}
            fetchLatestNews={fetchLatestNews}
            isExtractingEvents={isExtractingEvents}
            isFetchingNews={isFetchingNews}
            isLoadingNews={isLoadingNews}
            lastFetchResult={lastFetchResult}
            newsError={newsError}
            newsItems={newsItems}
            newsSources={newsSources}
            saveEvent={saveEvent}
          />
        ) : activePage === "推演" ? (
          <SimulationPage
            activeSimulation={activeSimulation}
            activeBranches={activeBranches}
            agents={worldState?.nodes ?? []}
            confirmSimulationIntervention={confirmSimulationIntervention}
            createSimulation={createSimulation}
            events={events}
            isConfirmingIntervention={isConfirmingIntervention}
            isCreatingSimulation={isCreatingSimulation}
            isParsingIntervention={isParsingIntervention}
            parseSimulationIntervention={parseSimulationIntervention}
            simulationError={simulationError}
            simulations={simulations}
          />
        ) : activePage === "报告" ? (
          <ReportsPage
            activeReport={activeReport}
            activeSimulation={activeSimulation}
            exportReportMarkdown={exportReportMarkdown}
            generateReport={generateReport}
            isLoadingReport={isLoadingReport}
            reportError={reportError}
            reportMarkdown={reportMarkdown}
            simulations={simulations}
          />
        ) : (
          <SettingsPage
            llmStatus={llmStatus}
            newsError={newsError}
            newsSources={newsSources}
            resetSeedData={resetSeedData}
            runtimeStatus={runtimeStatus}
            toggleNewsSource={toggleNewsSource}
            worldState={worldState}
            worldStateError={worldStateError}
          />
        )}
      </section>
    </main>
  );
}

function SituationDashboard({
  detailSelection,
  edges,
  isLoading,
  nodes,
  onSelectionChange,
  relationCount,
  topCapabilityAgents,
  worldState,
  worldStateError
}: {
  detailSelection: DetailSelection;
  edges: Edge[];
  isLoading: boolean;
  nodes: Node[];
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  relationCount: number;
  topCapabilityAgents: Array<Agent & { averageCapability: number }>;
  worldState: WorldState | null;
  worldStateError: string | null;
}) {
  return (
    <div className="situation-layout">
      <section className="main-column">
        <Card className="network-panel">
          <CardHeader>
            <div className="card-heading-row">
              <CardTitle>主体关系网络</CardTitle>
              <span className="badge neutral" data-testid="network-summary">
                {worldState ? `${worldState.nodes.length} nodes / ${relationCount} edges` : "Loading"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flow-shell" data-testid="react-flow-network">
              {isLoading ? (
                <div className="loading-state">Loading seed world state</div>
              ) : worldState ? (
                <ReactFlow
                  fitView
                  edges={edges}
                  minZoom={0.55}
                  nodes={nodes}
                  nodesDraggable={false}
                  onSelectionChange={onSelectionChange}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#d7dce2" gap={24} />
                  <MiniMap pannable zoomable nodeColor="#2f6f73" />
                  <Controls position="bottom-left" />
                </ReactFlow>
              ) : (
                <div className="loading-state">World state unavailable</div>
              )}
            </div>
            {worldState ? (
              <div className="network-selectors">
                <div data-testid="node-selector-list">
                  {worldState.nodes.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => onSelectionChange({ nodes: [{ id: agent.id } as Node], edges: [] })}
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
                <div data-testid="edge-selector-list">
                  {worldState.edges.slice(0, 4).map((relation) => (
                    <button
                      key={`${relation.source}-${relation.target}`}
                      type="button"
                      onClick={() =>
                        onSelectionChange({
                          nodes: [],
                          edges: [{ id: `${relation.source}-${relation.target}` } as Edge]
                        })
                      }
                    >
                      {`${relation.source} -> ${relation.target}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {worldStateError ? <p className="error-text">{worldStateError}</p> : null}
          </CardContent>
        </Card>

        <div className="lower-dashboard-grid">
          <Card>
            <CardHeader>
              <CardTitle>风险排行榜</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="risk-list" data-testid="risk-ranking">
                {riskItems.map((item) => (
                  <li key={item.name}>
                    <span className={`risk-dot ${item.level.toLowerCase()}`} />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.probability}% · uncertainty {item.uncertainty}</span>
                    </div>
                    <span className={`badge ${item.level.toLowerCase()}`}>{item.level}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>关键变量</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="variable-list" data-testid="key-variables">
                {keyVariables.map((variable) => (
                  <li key={variable.name}>
                    <span>{variable.name}</span>
                    <strong>{variable.value}</strong>
                    <em>{variable.trend}</em>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <aside className="insight-column">
        <DetailPanel selection={detailSelection} />

        <Card>
          <CardHeader>
            <CardTitle>核心能力</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="metric-list">
              {topCapabilityAgents.map((agent) => (
                <li key={agent.id}>
                  <span>{agent.name}</span>
                  <strong>{agent.averageCapability.toFixed(2)}</strong>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近推演入口</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="simulation-list" data-testid="recent-simulations">
              {recentSimulations.map((simulation) => (
                <li key={simulation.title}>
                  <PlayCircle aria-hidden="true" />
                  <div>
                    <strong>{simulation.title}</strong>
                    <span>{simulation.rounds} rounds · {simulation.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function DetailPanel({ selection }: { selection: DetailSelection }) {
  if (!selection) {
    return (
      <Card className="detail-panel" data-testid="detail-panel">
        <CardHeader>
          <CardTitle>详情侧栏</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="placeholder-text">Select a node or relation to inspect structured details.</p>
        </CardContent>
      </Card>
    );
  }

  if (selection.type === "agent") {
    return (
      <Card className="detail-panel" data-testid="detail-panel">
        <CardHeader>
          <div className="card-heading-row">
            <CardTitle>{selection.agent.name}</CardTitle>
            <span className="badge neutral">{selection.agent.type}</span>
          </div>
        </CardHeader>
        <CardContent>
          <section className="detail-section">
            <h3>Goals</h3>
            <ul className="tag-list" data-testid="agent-goals">
              {selection.agent.goals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          </section>
          <section className="detail-section">
            <h3>Capabilities</h3>
            <div className="capability-bars" data-testid="agent-capabilities">
              {Object.entries(selection.agent.capabilities).map(([name, value]) => (
                <div className="capability-row" key={name}>
                  <span>{formatCapabilityName(name)}</span>
                  <div>
                    <i style={{ width: `${value * 100}%` }} />
                  </div>
                  <strong>{value.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="detail-section compact-facts">
            <span>Recent events: seed only</span>
            <span>Simulation participation: 0</span>
          </section>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="detail-panel" data-testid="detail-panel">
      <CardHeader>
        <CardTitle>{`${selection.relation.source} -> ${selection.relation.target}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="relation-summary">{selection.relation.summary}</p>
        <div className="relation-metrics" data-testid="relation-metrics">
          <MetricLabel label="Friendliness" value={selection.relation.friendliness} max={1} min={-1} />
          <MetricLabel label="Trade dependency" value={selection.relation.trade_dependency} />
          <MetricLabel label="Military tension" value={selection.relation.military_tension} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricLabel({ label, value, max = 1, min = 0 }: { label: string; value: number; max?: number; min?: number }) {
  const normalized = ((value - min) / (max - min)) * 100;
  return (
    <div className="relation-metric">
      <span>{label}</span>
      <div>
        <i style={{ width: `${normalized}%` }} />
      </div>
      <strong>{value.toFixed(2)}</strong>
    </div>
  );
}

function NewsEventsPage({
  eventError,
  events,
  extractEvents,
  fetchLatestNews,
  isExtractingEvents,
  isFetchingNews,
  isLoadingNews,
  lastFetchResult,
  newsError,
  newsItems,
  newsSources,
  saveEvent
}: {
  eventError: string | null;
  events: EventItem[];
  extractEvents: (newsIds: number[]) => Promise<void>;
  fetchLatestNews: () => Promise<void>;
  isExtractingEvents: boolean;
  isFetchingNews: boolean;
  isLoadingNews: boolean;
  lastFetchResult: NewsFetchResult | null;
  newsError: string | null;
  newsItems: NewsItem[];
  newsSources: NewsSource[];
  saveEvent: (eventId: number, updates: Partial<EventItem>) => Promise<void>;
}) {
  const [selectedSourceId, setSelectedSourceId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState("all");
  const [selectedNewsId, setSelectedNewsId] = useState<number | null>(null);

  const filteredNews = useMemo(() => {
    const now = Date.now();
    const earliest =
      selectedTimeRange === "24h"
        ? now - 24 * 60 * 60 * 1000
        : selectedTimeRange === "7d"
          ? now - 7 * 24 * 60 * 60 * 1000
          : null;

    return newsItems.filter((item) => {
      if (selectedSourceId !== "all" && item.source_id !== selectedSourceId) {
        return false;
      }
      if (selectedStatus !== "all" && item.extraction_status !== selectedStatus) {
        return false;
      }
      if (earliest) {
        const timestamp = Date.parse(item.published_at ?? item.fetched_at);
        if (Number.isNaN(timestamp) || timestamp < earliest) {
          return false;
        }
      }
      return true;
    });
  }, [newsItems, selectedSourceId, selectedStatus, selectedTimeRange]);

  const selectedNews = filteredNews.find((item) => item.id === selectedNewsId) ?? filteredNews[0] ?? null;
  const selectedNewsEvents = selectedNews
    ? events.filter((event) => event.source_news_ids.includes(selectedNews.id))
    : [];

  return (
    <div className="news-layout">
      <Card>
        <CardHeader>
          <div className="card-heading-row">
            <CardTitle>新闻事件</CardTitle>
            <Button onClick={() => void fetchLatestNews()} disabled={isFetchingNews}>
              <RefreshCcw aria-hidden="true" />
              {isFetchingNews ? "抓取中" : "抓取新闻"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="filter-row">
            <label>
              <SlidersHorizontal aria-hidden="true" />
              来源
              <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
                <option value="all">全部来源</option>
                {newsSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              抽取状态
              <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                <option value="all">全部</option>
                <option value="pending">pending</option>
                <option value="extracted">extracted</option>
                <option value="failed">failed</option>
              </select>
            </label>
            <label>
              时间
              <select value={selectedTimeRange} onChange={(event) => setSelectedTimeRange(event.target.value)}>
                <option value="all">全部时间</option>
                <option value="24h">最近 24 小时</option>
                <option value="7d">最近 7 天</option>
              </select>
            </label>
          </div>
          {lastFetchResult ? (
            <div className="fetch-summary" data-testid="news-fetch-summary">
              <span>{lastFetchResult.sources_checked} sources</span>
              <span>{lastFetchResult.inserted} inserted</span>
              <span>{lastFetchResult.duplicates} duplicates</span>
            </div>
          ) : null}
          {newsError ? <p className="error-text">{newsError}</p> : null}
          <div className="data-table" data-testid="news-events-page">
            <div className="table-row news-table-row table-head">
              <span>Title</span>
              <span>Source</span>
              <span>Published</span>
              <span>Status</span>
              <span>Open</span>
            </div>
            {isLoadingNews ? (
              <div className="table-empty">Loading news records</div>
            ) : filteredNews.length === 0 ? (
              <div className="table-empty">No news records match the current filters</div>
            ) : (
              filteredNews.map((row) => (
                <div
                  className="table-row news-table-row"
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedNewsId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setSelectedNewsId(row.id);
                    }
                  }}
                >
                  <span>{row.title}</span>
                  <span>{row.source}</span>
                  <span>{formatDate(row.published_at ?? row.fetched_at)}</span>
                  <span><span className="badge neutral">{row.extraction_status}</span></span>
                  <span>
                    <a href={row.url} target="_blank" rel="noreferrer" aria-label={`Open ${row.title}`}>
                      <ExternalLink aria-hidden="true" />
                    </a>
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="news-detail-card" data-testid="news-detail-drawer">
        <CardHeader>
          <CardTitle>新闻详情</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedNews ? (
            <article className="news-detail">
              <span className="badge neutral">{selectedNews.extraction_status}</span>
              <h2>{selectedNews.title}</h2>
              <dl>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedNews.source}</dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>{formatDate(selectedNews.published_at)}</dd>
                </div>
                <div>
                  <dt>Fetched</dt>
                  <dd>{formatDate(selectedNews.fetched_at)}</dd>
                </div>
              </dl>
              <p>{selectedNews.summary ?? "No summary provided by the source feed."}</p>
              <a className="source-link" href={selectedNews.url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                打开新闻来源
              </a>
              <Button onClick={() => void extractEvents([selectedNews.id])} disabled={isExtractingEvents}>
                <FilePenLine aria-hidden="true" />
                {isExtractingEvents ? "抽取中" : "抽取事件"}
              </Button>
              {eventError ? <p className="error-text">{eventError}</p> : null}
              <div className="event-editor-list" data-testid="event-editor-list">
                {selectedNewsEvents.length === 0 ? (
                  <p className="placeholder-text">该新闻尚未生成结构化事件。</p>
                ) : (
                  selectedNewsEvents.map((event) => (
                    <EventEditor key={event.id} event={event} saveEvent={saveEvent} />
                  ))
                )}
              </div>
            </article>
          ) : (
            <p className="placeholder-text">抓取新闻后可在这里查看摘要、来源和抽取状态。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventEditor({
  event,
  saveEvent
}: {
  event: EventItem;
  saveEvent: (eventId: number, updates: Partial<EventItem>) => Promise<void>;
}) {
  const [formState, setFormState] = useState({
    actor: event.actor,
    targets: event.targets.join(", "),
    action: event.action,
    domain: event.domain,
    intensity: event.intensity.toString(),
    summary: event.summary,
    occurred_at: event.occurred_at ?? "",
    needs_review: event.needs_review
  });

  useEffect(() => {
    setFormState({
      actor: event.actor,
      targets: event.targets.join(", "),
      action: event.action,
      domain: event.domain,
      intensity: event.intensity.toString(),
      summary: event.summary,
      occurred_at: event.occurred_at ?? "",
      needs_review: event.needs_review
    });
  }, [event]);

  return (
    <form
      className="event-editor"
      data-testid="event-editor"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        void saveEvent(event.id, {
          actor: formState.actor,
          targets: formState.targets
            .split(",")
            .map((target) => target.trim())
            .filter(Boolean),
          action: formState.action,
          domain: formState.domain,
          intensity: Number(formState.intensity),
          summary: formState.summary,
          occurred_at: formState.occurred_at || null,
          needs_review: formState.needs_review
        });
      }}
    >
      <div className="card-heading-row">
        <strong>结构化事件 #{event.id}</strong>
        {formState.needs_review ? <span className="badge medium">needs_review</span> : <span className="badge low">ready</span>}
      </div>
      <label>
        Actor
        <input
          value={formState.actor}
          onChange={(inputEvent) => setFormState({ ...formState, actor: inputEvent.target.value })}
        />
      </label>
      <label>
        Targets
        <input
          value={formState.targets}
          onChange={(inputEvent) => setFormState({ ...formState, targets: inputEvent.target.value })}
        />
      </label>
      <label>
        Action
        <input
          value={formState.action}
          onChange={(inputEvent) => setFormState({ ...formState, action: inputEvent.target.value })}
        />
      </label>
      <label>
        Domain
        <select
          value={formState.domain}
          onChange={(inputEvent) => setFormState({ ...formState, domain: inputEvent.target.value })}
        >
          <option value="diplomacy">diplomacy</option>
          <option value="security">security</option>
          <option value="economic">economic</option>
          <option value="humanitarian">humanitarian</option>
        </select>
      </label>
      <label>
        Intensity
        <input
          max="1"
          min="0"
          step="0.01"
          type="number"
          value={formState.intensity}
          onChange={(inputEvent) => setFormState({ ...formState, intensity: inputEvent.target.value })}
        />
      </label>
      <label>
        Occurred at
        <input
          value={formState.occurred_at}
          onChange={(inputEvent) => setFormState({ ...formState, occurred_at: inputEvent.target.value })}
        />
      </label>
      <label className="review-toggle">
        <input
          checked={formState.needs_review}
          type="checkbox"
          onChange={(inputEvent) => setFormState({ ...formState, needs_review: inputEvent.target.checked })}
        />
        Mark needs_review
      </label>
      <label>
        Summary
        <textarea
          value={formState.summary}
          onChange={(inputEvent) => setFormState({ ...formState, summary: inputEvent.target.value })}
        />
      </label>
      <Button type="submit">
        <FilePenLine aria-hidden="true" />
        保存事件
      </Button>
    </form>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
function SimulationPage({
  activeSimulation,
  activeBranches,
  agents,
  confirmSimulationIntervention,
  createSimulation,
  events,
  isConfirmingIntervention,
  isCreatingSimulation,
  isParsingIntervention,
  parseSimulationIntervention,
  simulationError,
  simulations
}: {
  activeSimulation: SimulationItem | null;
  activeBranches: SimulationBranchesPayload | null;
  agents: Agent[];
  confirmSimulationIntervention: (simulationId: number, interventionId: number, branchName: string) => Promise<SimulationBranch | null>;
  createSimulation: (eventId: number, agentIds: string[], rounds: number) => Promise<void>;
  events: EventItem[];
  isConfirmingIntervention: boolean;
  isCreatingSimulation: boolean;
  isParsingIntervention: boolean;
  parseSimulationIntervention: (simulationId: number, text: string, fromRound: number) => Promise<InterventionItem | null>;
  simulationError: string | null;
  simulations: SimulationItem[];
}) {
  const [selectedEventId, setSelectedEventId] = useState<number | "">("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [rounds, setRounds] = useState(3);
  const [activeBranchId, setActiveBranchId] = useState<"original" | number>("original");
  const [interventionText, setInterventionText] = useState("假设欧盟不跟进制裁");
  const [parsedIntervention, setParsedIntervention] = useState<InterventionItem | null>(null);
  const [branchName, setBranchName] = useState("");

  useEffect(() => {
    if (selectedEventId === "" && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (selectedAgentIds.length === 0 && agents.length > 0) {
      setSelectedAgentIds(agents.slice(0, 3).map((agent) => agent.id));
    }
  }, [agents, selectedAgentIds.length]);

  const decisionsByRound = useMemo(() => {
    const groups = new Map<number, SimulationDecision[]>();
    const visibleDecisions =
      activeBranchId === "original"
        ? (activeBranches?.original.decisions ?? activeSimulation?.decisions.filter((decision) => decision.branch_id === null) ?? [])
        : (activeBranches?.branches.find((branch) => branch.id === activeBranchId)?.decisions ?? []);
    for (const decision of visibleDecisions) {
      groups.set(decision.round, [...(groups.get(decision.round) ?? []), decision]);
    }
    return [...groups.entries()].sort(([left], [right]) => left - right);
  }, [activeBranches, activeBranchId, activeSimulation]);

  const branchOptions = activeBranches?.branches ?? [];
  const selectedBranchName =
    activeBranchId === "original"
      ? activeBranches?.original.name ?? "原始推演"
      : branchOptions.find((branch) => branch.id === activeBranchId)?.name ?? "分支";

  return (
    <div className="simulation-workspace">
      <Card className="simulation-control-panel">
        <CardHeader>
          <div className="card-heading-row">
            <CardTitle>推演配置</CardTitle>
            <span className="badge neutral">{simulations.length} saved</span>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="simulation-form"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              if (selectedEventId === "" || selectedAgentIds.length === 0) {
                return;
              }
              void createSimulation(selectedEventId, selectedAgentIds, rounds);
            }}
          >
            <label>
              事件
              <select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(Number(event.target.value))}
              >
                {events.length === 0 ? <option value="">尚无事件</option> : null}
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {`#${event.id} ${event.title}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              轮数
              <input
                max="5"
                min="1"
                type="number"
                value={rounds}
                onChange={(event) => setRounds(Number(event.target.value))}
              />
            </label>
            <fieldset>
              <legend>参与 Agent</legend>
              <div className="agent-checkbox-grid">
                {agents.map((agent) => (
                  <label key={agent.id}>
                    <input
                      checked={selectedAgentIds.includes(agent.id)}
                      type="checkbox"
                      onChange={(event) => {
                        setSelectedAgentIds((currentIds) =>
                          event.target.checked
                            ? [...currentIds, agent.id]
                            : currentIds.filter((agentId) => agentId !== agent.id)
                        );
                      }}
                    />
                    {agent.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              disabled={isCreatingSimulation || selectedEventId === "" || selectedAgentIds.length === 0}
              type="submit"
            >
              <PlayCircle aria-hidden="true" />
              {isCreatingSimulation ? "推演中" : "运行推演"}
            </Button>
            {simulationError ? <p className="error-text">{simulationError}</p> : null}
          </form>
        </CardContent>
      </Card>

      <section className="simulation-timeline-panel" data-testid="simulation-page">
        <div className="simulation-title-row">
          <div>
            <p className="eyebrow">Mock decision loop</p>
            <h2>{activeSimulation?.title ?? "等待运行推演"}</h2>
          </div>
          {activeSimulation ? (
            <div className="simulation-meta">
              <span>{activeSimulation.rounds} rounds</span>
              <span>{activeSimulation.participant_agent_ids.length} agents</span>
              <span>{activeSimulation.status}</span>
            </div>
          ) : null}
        </div>
        {activeSimulation ? (
          <div className="branch-switcher" data-testid="branch-switcher">
            <label>
              <GitBranch aria-hidden="true" />
              分支
              <select
                value={activeBranchId}
                onChange={(event) =>
                  setActiveBranchId(event.target.value === "original" ? "original" : Number(event.target.value))
                }
              >
                <option value="original">原始推演</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="badge neutral">{selectedBranchName}</span>
          </div>
        ) : null}
        {activeSimulation ? (
          <div className="timeline simulation-timeline">
            {decisionsByRound.map(([roundNumber, roundDecisions]) => (
              <article key={roundNumber} className="round-block">
                <div className="round-marker">
                  <Clock3 aria-hidden="true" />
                  <strong>{`Round ${roundNumber}`}</strong>
                  <span>{roundDecisions.length} Agent responses</span>
                </div>
                <div className="decision-card-grid">
                  {roundDecisions.map((decision) => (
                    <SimulationDecisionCard
                      agent={agents.find((candidate) => candidate.id === decision.agent_id)}
                      decision={decision}
                      key={decision.id}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="simulation-empty-state">
            <PlayCircle aria-hidden="true" />
            <span>选择事件、Agent 和轮数后运行推演。</span>
          </div>
        )}
      </section>

      <section className="intervention-dock" data-testid="intervention-dock">
        <form
          className="intervention-input-row"
          onSubmit={async (submitEvent) => {
            submitEvent.preventDefault();
            if (!activeSimulation || !interventionText.trim()) {
              return;
            }
            const parsed = await parseSimulationIntervention(activeSimulation.id, interventionText, activeSimulation.rounds);
            setParsedIntervention(parsed);
            setBranchName(parsed?.parsed_payload.suggested_branch_name ?? "");
          }}
        >
          <label>
            自然语言干预
            <input
              disabled={!activeSimulation}
              value={interventionText}
              onChange={(event) => setInterventionText(event.target.value)}
              placeholder="假设欧盟不跟进制裁"
            />
          </label>
          <Button disabled={!activeSimulation || isParsingIntervention || !interventionText.trim()} type="submit">
            <FilePenLine aria-hidden="true" />
            {isParsingIntervention ? "解析中" : "解析干预"}
          </Button>
        </form>
        {parsedIntervention ? (
          <div className="intervention-confirm-panel" data-testid="intervention-confirm-panel">
            <div>
              <strong>解析结果</strong>
              <p>{parsedIntervention.parsed_payload.assumption}</p>
              <ul className="intervention-facts">
                <li>Actors: {parsedIntervention.parsed_payload.actors.join(", ") || "not specified"}</li>
                <li>Policy shift: {parsedIntervention.parsed_payload.policy_shift}</li>
                <li>Effect: {parsedIntervention.parsed_payload.expected_effect}</li>
              </ul>
            </div>
            <label>
              分支命名
              <input value={branchName} onChange={(event) => setBranchName(event.target.value)} />
            </label>
            <Button
              disabled={!activeSimulation || isConfirmingIntervention}
              onClick={async () => {
                if (!activeSimulation) {
                  return;
                }
                const branch = await confirmSimulationIntervention(activeSimulation.id, parsedIntervention.id, branchName);
                if (branch) {
                  setActiveBranchId(branch.id);
                }
                setParsedIntervention(null);
              }}
              type="button"
            >
              <GitBranch aria-hidden="true" />
              {isConfirmingIntervention ? "生成中" : "确认生成分支"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SimulationDecisionCard({
  agent,
  decision
}: {
  agent: Agent | undefined;
  decision: SimulationDecision;
}) {
  return (
    <section className="decision-card" data-testid="simulation-decision-card">
      <div className="card-heading-row">
        <strong>{agent?.name ?? decision.agent_id}</strong>
        <span className="badge low">{`${Math.round(decision.confidence * 100)}% confidence`}</span>
      </div>
      <p>{decision.perception}</p>
      <div>
        <h3>Goals</h3>
        <ul className="tag-list">
          {decision.goals_considered.map((goal, index) => (
            <li key={`${goal}-${index}`}>{goal}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Candidate actions</h3>
        <ul className="option-list">
          {decision.options.map((option) => (
            <li key={option.action}>
              <span>{option.action}</span>
              <strong>{option.score.toFixed(2)}</strong>
              <em>{option.rationale}</em>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Decision</h3>
        <p>{decision.decision}</p>
      </div>
      <div>
        <h3>Sources</h3>
        <code>{JSON.stringify(decision.citations)}</code>
      </div>
    </section>
  );
}

function ReportsPage({
  activeReport,
  activeSimulation,
  exportReportMarkdown,
  generateReport,
  isLoadingReport,
  reportError,
  reportMarkdown,
  simulations
}: {
  activeReport: ReportItem | null;
  activeSimulation: SimulationItem | null;
  exportReportMarkdown: (simulationId: number) => Promise<void>;
  generateReport: (simulationId: number) => Promise<void>;
  isLoadingReport: boolean;
  reportError: string | null;
  reportMarkdown: string;
  simulations: SimulationItem[];
}) {
  const [selectedSimulationId, setSelectedSimulationId] = useState<number | "">("");

  useEffect(() => {
    if (selectedSimulationId === "" && activeSimulation) {
      setSelectedSimulationId(activeSimulation.id);
    } else if (selectedSimulationId === "" && simulations.length > 0) {
      setSelectedSimulationId(simulations[0].id);
    }
  }, [activeSimulation, selectedSimulationId, simulations]);

  const selectedId = selectedSimulationId === "" ? activeSimulation?.id : selectedSimulationId;

  return (
    <div className="report-workspace">
      <Card className="report-control-card">
        <CardHeader>
          <div className="card-heading-row">
            <CardTitle>研究简报</CardTitle>
            <span className="badge neutral">{simulations.length} simulations</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="report-controls">
            <label>
              推演
              <select
                value={selectedSimulationId}
                onChange={(event) => setSelectedSimulationId(Number(event.target.value))}
              >
                {simulations.length === 0 ? <option value="">尚无推演</option> : null}
                {simulations.map((simulation) => (
                  <option key={simulation.id} value={simulation.id}>
                    {`#${simulation.id} ${simulation.title}`}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={!selectedId || isLoadingReport}
              onClick={() => {
                if (selectedId) {
                  void generateReport(selectedId);
                }
              }}
            >
              <FileText aria-hidden="true" />
              {isLoadingReport ? "生成中" : "生成报告"}
            </Button>
            <Button
              disabled={!selectedId || isLoadingReport}
              onClick={() => {
                if (selectedId) {
                  void exportReportMarkdown(selectedId);
                }
              }}
              variant="secondary"
            >
              <Download aria-hidden="true" />
              Markdown 导出
            </Button>
            {reportError ? <p className="error-text">{reportError}</p> : null}
          </div>
        </CardContent>
      </Card>

      <section className="report-preview" data-testid="reports-page">
        {activeReport ? (
          <>
            <article className="report-section report-hero">
              <p className="eyebrow">Research brief</p>
              <h2>{activeReport.title}</h2>
              <p>{activeReport.event_summary.summary}</p>
              <div className="report-fact-grid">
                <span>Actor: {activeReport.event_summary.actor}</span>
                <span>Domain: {activeReport.event_summary.domain}</span>
                <span>Intensity: {activeReport.event_summary.intensity.toFixed(2)}</span>
                <span>Branches: {activeReport.timeline.some((item) => item.branch !== "原始推演") ? "included" : "original only"}</span>
              </div>
            </article>

            <article className="report-section">
              <h3>关键判断</h3>
              <ul className="report-list">
                {activeReport.key_judgments.map((judgment) => (
                  <li key={judgment}>{judgment}</li>
                ))}
              </ul>
            </article>

            <article className="report-section">
              <h3>主体响应</h3>
              <div className="report-agent-grid">
                {activeReport.agent_responses.map((response) => (
                  <section key={response.agent_id}>
                    <div className="card-heading-row">
                      <strong>{response.agent_id.toUpperCase()}</strong>
                      <span className="badge low">{Math.round(response.confidence * 100)}%</span>
                    </div>
                    <p>{response.decision}</p>
                    <small>Round {response.latest_round} · {response.goals_considered.join(", ")}</small>
                  </section>
                ))}
              </div>
            </article>

            <article className="report-section">
              <h3>时间线</h3>
              <ol className="report-timeline">
                {activeReport.timeline.map((item, index) => (
                  <li key={`${item.round}-${item.agent_id}-${item.branch}-${index}`}>
                    <strong>{`Round ${item.round} · ${item.agent_id.toUpperCase()} · ${item.branch}`}</strong>
                    <span>{item.decision}</span>
                  </li>
                ))}
              </ol>
            </article>

            <article className="report-section">
              <h3>风险分析</h3>
              <div className="report-risk-grid">
                {activeReport.risks.map((risk) => (
                  <section key={risk.name}>
                    <span className={`badge ${risk.level.toLowerCase()}`}>{risk.level}</span>
                    <strong>{risk.name}</strong>
                    <p>{risk.probability}% · uncertainty {risk.uncertainty}</p>
                    <small>{risk.rationale}</small>
                  </section>
                ))}
              </div>
            </article>

            <article className="report-section">
              <h3>关键变量</h3>
              <ul className="variable-list">
                {activeReport.key_variables.map((variable) => (
                  <li key={variable.name}>
                    <span>{variable.name}</span>
                    <strong>{variable.value}</strong>
                    <em>{variable.assessment}</em>
                  </li>
                ))}
              </ul>
            </article>

            <article className="report-section">
              <h3>来源链接</h3>
              <ul className="report-list">
                {activeReport.source_links.map((source) => (
                  <li key={`${source.type}-${source.id}-${source.title}`}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden="true" />
                        {source.title}
                      </a>
                    ) : (
                      <span>{source.title}</span>
                    )}
                    <small>{source.source}</small>
                  </li>
                ))}
              </ul>
            </article>

            {reportMarkdown ? (
              <article className="report-section">
                <h3>Markdown</h3>
                <pre data-testid="report-markdown">{reportMarkdown}</pre>
              </article>
            ) : null}
          </>
        ) : (
          <article className="report-section report-empty-state">
            <FileText aria-hidden="true" />
            <h2>等待生成研究简报</h2>
            <p>选择一次已完成推演后生成事件摘要、关键判断、主体响应、时间线、风险分析、关键变量和来源链接。</p>
          </article>
        )}
      </section>
    </div>
  );
}

function SettingsPage({
  llmStatus,
  newsError,
  newsSources,
  resetSeedData,
  runtimeStatus,
  toggleNewsSource,
  worldState,
  worldStateError
}: {
  llmStatus: LlmStatus | null;
  newsError: string | null;
  newsSources: NewsSource[];
  resetSeedData: () => Promise<void>;
  runtimeStatus: RuntimeStatus | null;
  toggleNewsSource: (sourceId: string, enabled: boolean) => Promise<void>;
  worldState: WorldState | null;
  worldStateError: string | null;
}) {
  return (
    <div className="settings-grid">
      <Card>
        <CardHeader>
          <CardTitle>种子数据状态</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="seed-status" data-testid="settings-seed-status">
            <div>
              <dt>Schema</dt>
              <dd>{worldState?.seed_status.schema_version ?? "loading"}</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>{worldState?.seed_status.seed_version ?? "loading"}</dd>
            </div>
            <div>
              <dt>Agents</dt>
              <dd>{worldState?.seed_status.agent_count ?? 0}</dd>
            </div>
            <div>
              <dt>Relations</dt>
              <dd>{worldState?.seed_status.relation_count ?? 0}</dd>
            </div>
          </dl>
          <Button className="reset-button" onClick={() => void resetSeedData()}>
            <RefreshCcw aria-hidden="true" />
            重新导入种子数据
          </Button>
          {worldStateError ? <p className="error-text">{worldStateError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>新闻源配置</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="source-list" data-testid="settings-news-sources">
            {newsSources.map((source) => (
              <li key={source.id}>
                <div>
                  <strong>{source.name}</strong>
                  <span>{source.category} · {source.last_fetch_status}</span>
                  {source.last_error ? <em>{source.last_error}</em> : null}
                </div>
                <label className="toggle-row">
                  <input
                    checked={source.enabled}
                    type="checkbox"
                    onChange={(event) => void toggleNewsSource(source.id, event.target.checked)}
                  />
                  {source.enabled ? "启用" : "停用"}
                </label>
              </li>
            ))}
          </ul>
          {newsError ? <p className="error-text">{newsError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型配置状态</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="settings-list" data-testid="settings-llm-status">
            <li><Gauge aria-hidden="true" /> Default rounds: 3</li>
            <li><Activity aria-hidden="true" /> Provider: {llmStatus?.provider ?? "loading"}</li>
            <li><SlidersHorizontal aria-hidden="true" /> Mode: {llmStatus?.mode ?? "loading"}</li>
            <li><FilePenLine aria-hidden="true" /> Model: {llmStatus?.model ?? "not configured"}</li>
            <li><ExternalLink aria-hidden="true" /> Base URL: {llmStatus?.base_url ?? "not configured"}</li>
            <li><Newspaper aria-hidden="true" /> News sources: {newsSources.filter((source) => source.enabled).length} enabled</li>
          </ul>
          {llmStatus && !llmStatus.configured ? (
            <p className="hint-text">未配置真实模型时，事件抽取和推演使用 mock provider。</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>运行诊断</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="settings-list" data-testid="settings-runtime-status">
            <li><Activity aria-hidden="true" /> API: {runtimeStatus ? `${runtimeStatus.api.host}:${runtimeStatus.api.port}` : "loading"}</li>
            <li><Gauge aria-hidden="true" /> Status: {runtimeStatus?.status ?? "loading"}</li>
            <li><ShieldCheck aria-hidden="true" /> Database: {runtimeStatus?.database.reachable ? "reachable" : "unavailable"}</li>
            <li><FileText aria-hidden="true" /> SQLite: {runtimeStatus?.database.sqlite_path ?? "not configured"}</li>
            <li><Newspaper aria-hidden="true" /> Seed news sources: {runtimeStatus?.news_sources.count ?? 0}</li>
          </ul>
          {runtimeStatus?.database.error ? <p className="error-text">{runtimeStatus.database.error}</p> : null}
          {runtimeStatus ? (
            <p className="hint-text">
              Runtime checks: {Object.entries(runtimeStatus.checks).filter(([, passed]) => passed).length}/{Object.keys(runtimeStatus.checks).length} passed.
            </p>
          ) : (
            <p className="hint-text">后端诊断接口不可用时，请先确认 `./dev.sh` 中的 backend 已启动。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
