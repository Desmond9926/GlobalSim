import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const worldState = {
  nodes: [
    { id: "china", name: "China", type: "country", goals: ["national_security"], capabilities: { economy: 0.9 } },
    { id: "usa", name: "USA", type: "country", goals: ["deterrence"], capabilities: { economy: 0.94 } },
    { id: "russia", name: "Russia", type: "country", goals: ["security_buffer"], capabilities: { economy: 0.58 } },
    { id: "eu", name: "EU", type: "bloc", goals: ["regional_stability"], capabilities: { economy: 0.88 } },
    { id: "nato", name: "NATO", type: "alliance", goals: ["collective_defense"], capabilities: { economy: 0.78 } },
    { id: "un", name: "UN", type: "institution", goals: ["international_norms"], capabilities: { economy: 0.45 } }
  ],
  edges: [
    {
      source: "china",
      target: "usa",
      friendliness: -0.62,
      trade_dependency: 0.82,
      military_tension: 0.74,
      summary: "Strategic competition"
    }
  ],
  seed_status: {
    schema_version: "phase8",
    seed_version: "phase1-core-world-state-v1",
    seed_imported_at: "2026-06-05 00:00:00",
    agent_count: 6,
    relation_count: 1
  }
};

const newsSources = [
  {
    id: "bbc-world",
    name: "BBC News World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "global_media",
    enabled: true,
    last_fetched_at: null,
    last_fetch_status: "never",
    last_error: null
  },
  {
    id: "un-news",
    name: "UN News",
    url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
    category: "institution",
    enabled: true,
    last_fetched_at: null,
    last_fetch_status: "never",
    last_error: null
  }
];

const newsItems = [
  {
    id: 1,
    source_id: "bbc-world",
    title: "GlobalSim test headline",
    source: "BBC News World",
    url: "https://example.com/news/1",
    published_at: "2026-06-05T02:15:00Z",
    summary: "RSS summary for a deterministic test article.",
    fetched_at: "2026-06-05T02:20:00Z",
    fingerprint: "https://example.com/news/1",
    extraction_status: "pending"
  }
];

const extractedNewsItems = [{ ...newsItems[0], extraction_status: "extracted" }];

const eventItems = [
  {
    id: 1,
    title: "GlobalSim test headline",
    actor: "usa",
    targets: ["china"],
    action: "announcement",
    domain: "diplomacy",
    intensity: 0.5,
    summary: "Mock extracted event summary.",
    occurred_at: "2026-06-05T02:15:00Z",
    needs_review: true,
    source_news_ids: [1],
    created_at: "2026-06-05T02:30:00Z",
    updated_at: "2026-06-05T02:30:00Z"
  }
];

const simulationItem = {
  id: 1,
  title: "GlobalSim test headline - 3 round mock simulation",
  source_event_id: 1,
  rounds: 3,
  status: "completed",
  input_snapshot: {
    event: eventItems[0],
    agents: [worldState.nodes[0], worldState.nodes[1], worldState.nodes[5]],
    rounds: 3,
    mode: "mock"
  },
  participant_agent_ids: ["china", "usa", "un"],
  decisions: [
    {
      id: 1,
      simulation_id: 1,
      branch_id: null,
      round: 1,
      agent_id: "china",
      perception: "Round 1: China reads usa announcement as a diplomacy signal with intensity 0.50.",
      goals_considered: ["national_security", "economic_growth"],
      options: [
        { action: "contest_signal", score: 0.6, rationale: "Aligns China with national_security." },
        { action: "de_escalate_contact", score: 0.61, rationale: "Keeps diplomatic optionality open." }
      ],
      decision: "China chooses de_escalate_contact and references GlobalSim test headline.",
      confidence: 0.69,
      citations: [{ type: "event", id: 1, title: "GlobalSim test headline" }],
      created_at: "2026-06-05T03:00:00Z"
    },
    {
      id: 2,
      simulation_id: 1,
      branch_id: null,
      round: 1,
      agent_id: "usa",
      perception: "Round 1: USA reads usa announcement as a diplomacy signal with intensity 0.50.",
      goals_considered: ["deterrence", "deterrence"],
      options: [
        { action: "reinforce_signal", score: 0.6, rationale: "Aligns USA with deterrence." }
      ],
      decision: "USA chooses reinforce_signal and references GlobalSim test headline.",
      confidence: 0.69,
      citations: [{ type: "event", id: 1, title: "GlobalSim test headline" }],
      created_at: "2026-06-05T03:00:00Z"
    },
    {
      id: 3,
      simulation_id: 1,
      branch_id: null,
      round: 2,
      agent_id: "un",
      perception: "Round 2: UN reads usa announcement as a diplomacy signal with intensity 0.50.",
      goals_considered: ["international_norms", "international_norms"],
      options: [
        { action: "mediate_signal", score: 0.64, rationale: "Aligns UN with international_norms." }
      ],
      decision: "UN chooses mediate_signal and references GlobalSim test headline.",
      confidence: 0.73,
      citations: [{ type: "event", id: 1, title: "GlobalSim test headline" }],
      created_at: "2026-06-05T03:00:00Z"
    }
  ],
  branches: [],
  interventions: [],
  created_at: "2026-06-05T03:00:00Z",
  updated_at: "2026-06-05T03:00:00Z"
};

const parsedIntervention = {
  id: 1,
  simulation_id: 1,
  branch_id: null,
  raw_text: "假设欧盟不跟进制裁",
  parsed_payload: {
    assumption: "假设欧盟不跟进制裁",
    actors: ["eu"],
    targets: ["eu"],
    domain: "economic",
    policy_shift: "refrain_from_sanctions",
    action: "reduce_escalation",
    from_round: 3,
    intensity_delta: -0.12,
    expected_effect: "reduces alignment pressure and opens a lower-escalation branch",
    suggested_branch_name: "EU intervention branch",
    requires_confirmation: true
  },
  status: "pending_confirmation",
  created_at: "2026-06-05T03:05:00Z"
};

const branchItem = {
  id: 1,
  simulation_id: 1,
  parent_branch_id: null,
  name: "EU intervention branch",
  from_round: 3,
  intervention_id: 1,
  created_at: "2026-06-05T03:06:00Z",
  decisions: [
    {
      ...simulationItem.decisions[0],
      id: 10,
      branch_id: 1,
      decision: "[EU intervention branch] China chooses de_escalate_contact and references GlobalSim test headline."
    }
  ]
};

const simulationBranches = {
  simulation_id: 1,
  original: {
    id: null,
    name: "原始推演",
    from_round: 0,
    decisions: simulationItem.decisions
  },
  branches: [branchItem],
  interventions: [{ ...parsedIntervention, branch_id: 1, status: "confirmed" }]
};

const reportItem = {
  id: 1,
  simulation_id: 1,
  title: "Research Brief: GlobalSim test headline",
  event_summary: {
    title: "GlobalSim test headline",
    actor: "usa",
    targets: ["china"],
    action: "announcement",
    domain: "diplomacy",
    intensity: 0.5,
    summary: "Mock extracted event summary.",
    occurred_at: "2026-06-05T02:15:00Z"
  },
  key_judgments: [
    "USA remains the initiating actor in the diplomacy track.",
    "The leading risk is Escalation persistence at 54% with Medium uncertainty."
  ],
  agent_responses: [
    {
      agent_id: "china",
      latest_round: 1,
      decision: "China chooses de_escalate_contact and references GlobalSim test headline.",
      confidence: 0.69,
      goals_considered: ["national_security", "economic_growth"]
    }
  ],
  timeline: [
    {
      round: 1,
      agent_id: "china",
      branch: "原始推演",
      perception: "Round 1: China reads usa announcement as a diplomacy signal with intensity 0.50.",
      decision: "China chooses de_escalate_contact and references GlobalSim test headline.",
      confidence: 0.69
    }
  ],
  risks: [
    {
      name: "Escalation persistence",
      level: "Medium",
      probability: 54,
      uncertainty: "Medium",
      rationale: "Driven by event intensity and the persistence of multi-round agent responses."
    }
  ],
  key_variables: [
    { name: "Event intensity", value: "0.50", assessment: "Moderate leverage" }
  ],
  source_links: [
    {
      type: "news",
      id: 1,
      title: "GlobalSim test headline",
      source: "BBC News World",
      url: "https://example.com/news/1"
    }
  ],
  markdown:
    "# Research Brief: GlobalSim test headline\n\n## Event Summary\n\n## Key Judgments\n\n## Agent Responses\n\n## Timeline\n\n## Risk Analysis\n\n## Key Variables\n\n## Sources\n",
  created_at: "2026-06-05T03:10:00Z",
  updated_at: "2026-06-05T03:10:00Z"
};

const llmStatus = {
  provider: "mock",
  mode: "mock",
  configured: false,
  model: null,
  base_url: null,
  has_api_key: false
};

const runtimeStatus = {
  status: "ok",
  service: "globalsim-api",
  api: {
    host: "127.0.0.1",
    port: 8000
  },
  database: {
    url: "sqlite:///./data/globalsim.sqlite3",
    sqlite_path: "data/globalsim.sqlite3",
    exists: true,
    reachable: true
  },
  seed_status: worldState.seed_status,
  news_sources: {
    count: 2
  },
  llm: llmStatus,
  checks: {
    database: true,
    seed_agents: true,
    seed_relations: true,
    news_sources: true
  }
};

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.endsWith("/api/world-state")) {
          return { ok: true, json: async () => worldState };
        }
        if (url.endsWith("/api/llm/status")) {
          return { ok: true, json: async () => llmStatus };
        }
        if (url.endsWith("/api/runtime/status")) {
          return { ok: true, json: async () => runtimeStatus };
        }
        if (url.endsWith("/api/news/sources") && init?.method !== "PATCH") {
          return { ok: true, json: async () => newsSources };
        }
        if (url.includes("/api/news/sources/")) {
          return { ok: true, json: async () => ({ ...newsSources[0], enabled: false }) };
        }
        if (url.endsWith("/api/news/fetch")) {
          return {
            ok: true,
            json: async () => ({
              sources_checked: 2,
              inserted: 1,
              duplicates: 0,
              results: [],
              news: newsItems
            })
          };
        }
        if (url.endsWith("/api/news/extract-events")) {
          return {
            ok: true,
            json: async () => ({
              created: 1,
              events: eventItems,
              news: extractedNewsItems
            })
          };
        }
        if (url.includes("/api/events/")) {
          return {
            ok: true,
            json: async () => ({
              ...eventItems[0],
              summary: "Edited event summary.",
              needs_review: false
            })
          };
        }
        if (url.endsWith("/api/events")) {
          return { ok: true, json: async () => [] };
        }
        if (url.endsWith("/api/simulations") && init?.method === "POST") {
          return { ok: true, json: async () => simulationItem };
        }
        if (url.endsWith("/api/simulations/1/interventions")) {
          return { ok: true, json: async () => parsedIntervention };
        }
        if (url.endsWith("/api/simulations/1/interventions/confirm")) {
          return { ok: true, json: async () => branchItem };
        }
        if (url.endsWith("/api/simulations/1/branches")) {
          return { ok: true, json: async () => simulationBranches };
        }
        if (url.endsWith("/api/reports/1/markdown")) {
          return { ok: true, json: async () => ({ simulation_id: 1, title: reportItem.title, markdown: reportItem.markdown }) };
        }
        if (url.endsWith("/api/reports/1")) {
          return { ok: true, json: async () => reportItem };
        }
        if (url.endsWith("/api/simulations")) {
          return { ok: true, json: async () => [] };
        }
        if (url.includes("/api/simulations/")) {
          return { ok: true, json: async () => simulationItem };
        }
        if (url.endsWith("/api/news")) {
          return { ok: true, json: async () => newsItems };
        }
        return { ok: true, json: async () => ({}) };
      })
    );
  });

  it("renders the GlobalSim console shell with seed world state", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "态势盘" })).toBeInTheDocument();
    expect(await screen.findByTestId("network-summary")).toHaveTextContent("6 nodes");
    expect(screen.getByTestId("react-flow-network")).toHaveTextContent("China");
    expect(screen.getByTestId("risk-ranking")).toHaveTextContent("Trade escalation");
    expect(screen.getByTestId("key-variables")).toHaveTextContent("Alliance cohesion");
    expect(screen.getByTestId("recent-simulations")).toHaveTextContent("Export controls response");
    expect(screen.getByTestId("detail-panel")).toHaveTextContent("national_security");
  });

  it("shows seed status on the settings page", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(await screen.findByTestId("settings-seed-status")).toHaveTextContent("phase8");
    expect(screen.getByTestId("settings-seed-status")).toHaveTextContent("6");
    expect(await screen.findByTestId("settings-llm-status")).toHaveTextContent("Provider: mock");
    expect(screen.getByTestId("settings-llm-status")).toHaveTextContent("Mode: mock");
    expect(await screen.findByTestId("settings-runtime-status")).toHaveTextContent("Status: ok");
    expect(screen.getByTestId("settings-runtime-status")).toHaveTextContent("Database: reachable");
  });

  it("shows node and edge details from the network selectors", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "USA" }));
    expect(screen.getByTestId("detail-panel")).toHaveTextContent("deterrence");
    expect(screen.getByTestId("agent-capabilities")).toHaveTextContent("economy");

    fireEvent.click(screen.getByRole("button", { name: "china -> usa" }));
    expect(screen.getByTestId("detail-panel")).toHaveTextContent("Strategic competition");
    expect(screen.getByTestId("relation-metrics")).toHaveTextContent("Military tension");
  });

  it("switches between the five primary pages without a full reload", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "新闻事件" }));
    expect(screen.getByRole("heading", { level: 1, name: "新闻事件" })).toBeInTheDocument();
    expect(await screen.findByTestId("news-events-page")).toHaveTextContent("GlobalSim test headline");
    expect(screen.getByTestId("news-detail-drawer")).toHaveTextContent("RSS summary");

    fireEvent.click(screen.getByRole("button", { name: "推演" }));
    expect(screen.getByTestId("simulation-page")).toHaveTextContent("等待运行推演");

    fireEvent.click(screen.getByRole("button", { name: "报告" }));
    expect(screen.getByTestId("reports-page")).toHaveTextContent("等待生成研究简报");

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(await screen.findByTestId("settings-seed-status")).toHaveTextContent("phase8");
  });

  it("fetches news and shows source configuration", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "新闻事件" }));
    fireEvent.click(await screen.findByRole("button", { name: "抓取新闻" }));

    expect(await screen.findByTestId("news-fetch-summary")).toHaveTextContent("1 inserted");
    expect(screen.getByTestId("news-events-page")).toHaveTextContent("BBC News World");

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(await screen.findByTestId("settings-news-sources")).toHaveTextContent("BBC News World");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/news/sources/bbc-world",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("extracts a structured event from selected news and saves edits", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "新闻事件" }));
    fireEvent.click(await screen.findByRole("button", { name: "抽取事件" }));

    expect(await screen.findByTestId("event-editor")).toHaveTextContent("needs_review");
    expect(screen.getByDisplayValue("usa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mock extracted event summary.")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Mock extracted event summary."), {
      target: { value: "Edited event summary." }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存事件" }));

    expect(await screen.findByDisplayValue("Edited event summary.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/news/extract-events",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/events/1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("creates a multi-round simulation and shows structured agent decisions", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "新闻事件" }));
    fireEvent.click(await screen.findByRole("button", { name: "抽取事件" }));
    expect(await screen.findByTestId("event-editor")).toHaveTextContent("Mock extracted event summary.");

    fireEvent.click(screen.getByRole("button", { name: "推演" }));
    fireEvent.click(await screen.findByRole("button", { name: "运行推演" }));

    expect(await screen.findByTestId("simulation-page")).toHaveTextContent("Round 1");
    expect(screen.getByTestId("simulation-page")).toHaveTextContent("China chooses de_escalate_contact");
    expect(screen.getByTestId("simulation-page")).toHaveTextContent("Candidate actions");
    expect(screen.getByTestId("simulation-page")).toHaveTextContent("Sources");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/simulations",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("parses a natural language intervention and switches to the new branch", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "新闻事件" }));
    fireEvent.click(await screen.findByRole("button", { name: "抽取事件" }));
    expect(await screen.findByTestId("event-editor")).toHaveTextContent("Mock extracted event summary.");
    fireEvent.click(screen.getByRole("button", { name: "推演" }));
    fireEvent.click(await screen.findByRole("button", { name: "运行推演" }));
    expect(await screen.findByTestId("simulation-page")).toHaveTextContent("Round 1");

    fireEvent.click(await screen.findByRole("button", { name: "解析干预" }));
    expect(await screen.findByTestId("intervention-confirm-panel")).toHaveTextContent("refrain_from_sanctions");
    expect(screen.getByDisplayValue("EU intervention branch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认生成分支" }));

    expect(await screen.findByTestId("branch-switcher")).toHaveTextContent("EU intervention branch");
    expect(screen.getByTestId("simulation-page")).toHaveTextContent("[EU intervention branch]");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/simulations/1/interventions",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/simulations/1/interventions/confirm",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("generates a research brief and exports Markdown", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "新闻事件" }));
    fireEvent.click(await screen.findByRole("button", { name: "抽取事件" }));
    expect(await screen.findByTestId("event-editor")).toHaveTextContent("Mock extracted event summary.");
    fireEvent.click(screen.getByRole("button", { name: "推演" }));
    fireEvent.click(await screen.findByRole("button", { name: "运行推演" }));
    expect(await screen.findByTestId("simulation-page")).toHaveTextContent("Round 1");

    fireEvent.click(screen.getByRole("button", { name: "报告" }));
    fireEvent.click(screen.getByRole("button", { name: "生成报告" }));

    expect(await screen.findByTestId("reports-page")).toHaveTextContent("Research Brief: GlobalSim test headline");
    expect(screen.getByTestId("reports-page")).toHaveTextContent("关键判断");
    expect(screen.getByTestId("reports-page")).toHaveTextContent("风险分析");
    expect(screen.getByTestId("reports-page")).toHaveTextContent("54% · uncertainty Medium");
    expect(screen.getByTestId("reports-page")).toHaveTextContent("BBC News World");

    fireEvent.click(screen.getByRole("button", { name: "Markdown 导出" }));
    expect(await screen.findByTestId("report-markdown")).toHaveTextContent("## Risk Analysis");
    const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => url.toString());
    expect(calledUrls).toContain("http://127.0.0.1:8000/api/reports/1");
    expect(calledUrls).toContain("http://127.0.0.1:8000/api/reports/1/markdown");
  });
});
