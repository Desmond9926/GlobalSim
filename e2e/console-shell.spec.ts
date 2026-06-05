import { expect, type Page, test } from "@playwright/test";

test("opens the GlobalSim console shell", async ({ page }) => {
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
      agents: [
        { id: "china", name: "China", type: "country", goals: ["national_security"], capabilities: { economy: 0.9 } },
        { id: "usa", name: "USA", type: "country", goals: ["deterrence"], capabilities: { economy: 0.94 } },
        { id: "un", name: "UN", type: "institution", goals: ["international_norms"], capabilities: { economy: 0.45 } }
      ],
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
        round: 2,
        agent_id: "usa",
        perception: "Round 2: USA reads usa announcement as a diplomacy signal with intensity 0.50.",
        goals_considered: ["deterrence", "deterrence"],
        options: [{ action: "reinforce_signal", score: 0.64, rationale: "Aligns USA with deterrence." }],
        decision: "USA chooses reinforce_signal and references GlobalSim test headline.",
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
    key_variables: [{ name: "Event intensity", value: "0.50", assessment: "Moderate leverage" }],
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

  await page.route("http://127.0.0.1:8000/api/world-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
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
      }
    });
  });
  await page.route("http://127.0.0.1:8000/api/llm/status", async (route) => {
    await route.fulfill({ contentType: "application/json", json: llmStatus });
  });
  await page.route("http://127.0.0.1:8000/api/news", async (route) => {
    await route.fulfill({ contentType: "application/json", json: newsItems });
  });
  await page.route("http://127.0.0.1:8000/api/news/sources", async (route) => {
    await route.fulfill({ contentType: "application/json", json: newsSources });
  });
  await page.route("http://127.0.0.1:8000/api/news/fetch", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        sources_checked: 1,
        inserted: 1,
        duplicates: 0,
        results: [],
        news: newsItems
      }
    });
  });
  await page.route("http://127.0.0.1:8000/api/news/extract-events", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        created: 1,
        events: eventItems,
        news: extractedNewsItems
      }
    });
  });
  await page.route("http://127.0.0.1:8000/api/events", async (route) => {
    await route.fulfill({ contentType: "application/json", json: [] });
  });
  await page.route("http://127.0.0.1:8000/api/events/1", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        ...eventItems[0],
        summary: "Edited event summary.",
        needs_review: false
      }
    });
  });
  await page.route("http://127.0.0.1:8000/api/simulations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ contentType: "application/json", json: simulationItem });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: [] });
  });
  await page.route("http://127.0.0.1:8000/api/simulations/1/interventions", async (route) => {
    await route.fulfill({ contentType: "application/json", json: parsedIntervention });
  });
  await page.route("http://127.0.0.1:8000/api/simulations/1/interventions/confirm", async (route) => {
    await route.fulfill({ contentType: "application/json", json: branchItem });
  });
  await page.route("http://127.0.0.1:8000/api/simulations/1/branches", async (route) => {
    await route.fulfill({ contentType: "application/json", json: simulationBranches });
  });
  await page.route("http://127.0.0.1:8000/api/simulations/1", async (route) => {
    await route.fulfill({ contentType: "application/json", json: simulationItem });
  });
  await page.route("http://127.0.0.1:8000/api/reports/1/markdown", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { simulation_id: 1, title: reportItem.title, markdown: reportItem.markdown }
    });
  });
  await page.route("http://127.0.0.1:8000/api/reports/1", async (route) => {
    await route.fulfill({ contentType: "application/json", json: reportItem });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "态势盘" })).toBeVisible();
  await expect(page.getByTestId("react-flow-network")).toContainText("China");
  await expect(page.getByTestId("risk-ranking")).toContainText("Trade escalation");
  await expect(page.getByTestId("key-variables")).toContainText("Alliance cohesion");
  await expect(page.getByTestId("detail-panel")).toContainText("national_security");
  await page.getByRole("button", { name: "新闻事件" }).click();
  await expect(page.getByTestId("news-events-page")).toContainText("GlobalSim test headline");
  await expect(page.getByTestId("news-detail-drawer")).toContainText("RSS summary");
  await page.getByRole("button", { name: "抽取事件" }).click();
  await expect(page.getByTestId("event-editor")).toContainText("needs_review");
  await expect(page.locator("textarea")).toHaveValue("Mock extracted event summary.");
  await page.locator("textarea").fill("Edited event summary.");
  await page.getByRole("button", { name: "保存事件" }).click();
  await expect(page.locator("textarea")).toHaveValue("Edited event summary.");
  await page.getByRole("button", { name: "推演" }).click();
  await page.getByRole("button", { name: "运行推演" }).click();
  await expect(page.getByTestId("simulation-page")).toContainText("Round 1");
  await expect(page.getByTestId("simulation-page")).toContainText("China chooses de_escalate_contact");
  await expect(page.getByTestId("simulation-page")).toContainText("Candidate actions");
  await page.getByRole("button", { name: "解析干预" }).click();
  await expect(page.getByTestId("intervention-confirm-panel")).toContainText("refrain_from_sanctions");
  await page.getByRole("button", { name: "确认生成分支" }).click();
  await expect(page.getByTestId("branch-switcher")).toContainText("EU intervention branch");
  await expect(page.getByTestId("simulation-page")).toContainText("[EU intervention branch]");
  await page.getByRole("button", { name: "报告" }).click();
  await page.getByRole("button", { name: "生成报告" }).click();
  await expect(page.getByTestId("reports-page")).toContainText("Research Brief: GlobalSim test headline");
  await expect(page.getByTestId("reports-page")).toContainText("风险分析");
  await expect(page.getByTestId("reports-page")).toContainText("54% · uncertainty Medium");
  await page.getByRole("button", { name: "Markdown 导出" }).click();
  await expect(page.getByTestId("report-markdown")).toContainText("## Risk Analysis");
  await page.getByRole("button", { name: "新闻事件" }).click();
  await page.getByRole("button", { name: "抓取新闻" }).click();
  await expect(page.getByTestId("news-fetch-summary")).toContainText("1 inserted");
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByTestId("settings-seed-status")).toContainText("phase8");
  await expect(page.getByTestId("settings-news-sources")).toContainText("BBC News World");
  await expect(page.getByTestId("settings-llm-status")).toContainText("Provider: mock");
});

async function setupPhase9Routes(page: Page) {
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
      extraction_status: "extracted"
    }
  ];
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
      needs_review: false,
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
      agents: [
        { id: "china", name: "China", type: "country", goals: ["national_security"], capabilities: { economy: 0.9 } },
        { id: "usa", name: "USA", type: "country", goals: ["deterrence"], capabilities: { economy: 0.94 } },
        { id: "un", name: "UN", type: "institution", goals: ["international_norms"], capabilities: { economy: 0.45 } }
      ],
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
        options: [{ action: "de_escalate_contact", score: 0.61, rationale: "Keeps diplomatic optionality open." }],
        decision: "China chooses de_escalate_contact and references GlobalSim test headline.",
        confidence: 0.69,
        citations: [{ type: "event", id: 1, title: "GlobalSim test headline" }],
        created_at: "2026-06-05T03:00:00Z"
      }
    ],
    branches: [],
    interventions: [],
    created_at: "2026-06-05T03:00:00Z",
    updated_at: "2026-06-05T03:00:00Z"
  };
  const simulationBranches = {
    simulation_id: 1,
    original: {
      id: null,
      name: "原始推演",
      from_round: 0,
      decisions: simulationItem.decisions
    },
    branches: [],
    interventions: []
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
    key_judgments: ["USA remains the initiating actor in the diplomacy track."],
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
    key_variables: [{ name: "Event intensity", value: "0.50", assessment: "Moderate leverage" }],
    source_links: [{ type: "news", id: 1, title: "GlobalSim test headline", source: "BBC News World", url: "https://example.com/news/1" }],
    markdown: "# Research Brief: GlobalSim test headline\n\n## Risk Analysis\n",
    created_at: "2026-06-05T03:10:00Z",
    updated_at: "2026-06-05T03:10:00Z"
  };

  await page.route("http://127.0.0.1:8000/api/world-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
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
      }
    });
  });
  await page.route("http://127.0.0.1:8000/api/llm/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { provider: "mock", mode: "mock", configured: false, model: null, base_url: null, has_api_key: false }
    });
  });
  await page.route("http://127.0.0.1:8000/api/news", async (route) => {
    await route.fulfill({ contentType: "application/json", json: newsItems });
  });
  await page.route("http://127.0.0.1:8000/api/news/sources", async (route) => {
    await route.fulfill({ contentType: "application/json", json: newsSources });
  });
  await page.route("http://127.0.0.1:8000/api/events", async (route) => {
    await route.fulfill({ contentType: "application/json", json: eventItems });
  });
  await page.route("http://127.0.0.1:8000/api/simulations", async (route) => {
    await route.fulfill({ contentType: "application/json", json: [simulationItem] });
  });
  await page.route("http://127.0.0.1:8000/api/simulations/1/branches", async (route) => {
    await route.fulfill({ contentType: "application/json", json: simulationBranches });
  });
  await page.route("http://127.0.0.1:8000/api/simulations/1", async (route) => {
    await route.fulfill({ contentType: "application/json", json: simulationItem });
  });
  await page.route("http://127.0.0.1:8000/api/reports/1/markdown", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { simulation_id: 1, title: reportItem.title, markdown: reportItem.markdown } });
  });
  await page.route("http://127.0.0.1:8000/api/reports/1", async (route) => {
    await route.fulfill({ contentType: "application/json", json: reportItem });
  });
}

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width + 1);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
]) {
  test(`desktop layout is readable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupPhase9Routes(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "态势盘" })).toBeVisible();
    await expect(page.getByTestId("react-flow-network")).toBeVisible();
    await expect(page.getByTestId("detail-panel")).toBeVisible();
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "新闻事件" }).click();
    await expect(page.getByTestId("news-events-page")).toContainText("GlobalSim test headline");
    await expect(page.getByTestId("news-detail-drawer")).toBeVisible();
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "推演" }).click();
    await expect(page.getByTestId("simulation-page")).toContainText("Round 1");
    await expect(page.getByTestId("intervention-dock")).toBeVisible();
    await expectNoDocumentOverflow(page);

    await page.getByRole("button", { name: "报告" }).click();
    await page.getByRole("button", { name: "生成报告" }).click();
    await expect(page.getByTestId("reports-page")).toContainText("Research Brief: GlobalSim test headline");
    await expectNoDocumentOverflow(page);
  });
}

test("small screen can scroll through core information", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPhase9Routes(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "态势盘" })).toBeVisible();
  await expect(page.getByTestId("react-flow-network")).toContainText("China");
  await expectNoDocumentOverflow(page);

  await page.getByRole("button", { name: "推演" }).click();
  await expect(page.getByTestId("simulation-page")).toContainText("Round 1");
  await page.mouse.wheel(0, 900);
  await expect(page.getByTestId("intervention-dock")).toBeVisible();

  await page.getByRole("button", { name: "报告" }).click();
  await page.getByRole("button", { name: "生成报告" }).click();
  await expect(page.getByTestId("reports-page")).toContainText("Research Brief: GlobalSim test headline");
  await page.mouse.wheel(0, 1200);
  await expect(page.getByText("来源链接")).toBeVisible();
  await expectNoDocumentOverflow(page);
});
