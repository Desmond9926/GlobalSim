# GlobalSim MVP 功能细节计划

## Summary

构建一个面向研究分析者的国际政治局势推演 MVP：系统定时或手动抓取公开新闻源，将新闻抽取为结构化事件，基于内置世界状态和 6 个主体 Agent 进行多轮可解释推演，支持人工修改事件参数、强制指定 Agent 行动，并生成页面报告和 Markdown 报告。

默认范围：

- 单用户本地系统，不做登录。
- Web 控制台，前端使用 React + shadcn/ui。
- 前端采用现代 SaaS 风格，左侧导航、桌面优先，首页以关系网络和风险态势为核心。
- 后端使用 Python + FastAPI。
- 本地 SQLite 存储。
- LLM 通过可配置适配器接入 OpenAI 或 DeepSeek。
- 新闻源首版使用 RSS/公开源。
- 首版主体：China、USA、Russia、EU、NATO、UN。
- 关系网络首版使用 React Flow 展示核心主体与关系边，不强制实现世界地图。

## Key Changes

### 1. 新闻与事件层

实现新闻源管理、手动抓取和计划任务入口。

主要能力：

- 配置 RSS/公开源列表，例如 Reuters、BBC、UN、White House、中国外交部等。
- Web 页面提供“立即抓取”按钮。
- 后端提供可由系统计划任务调用的抓取接口。
- 新闻入库字段包含：标题、来源、URL、发布时间、摘要、抓取时间、去重指纹。
- 对新闻调用 LLM 抽取结构化事件。

事件结构：

```json
{
  "title": "US announces new chip export restrictions",
  "actor": "USA",
  "targets": ["China"],
  "action": "ExportRestriction",
  "domain": "Technology",
  "intensity": 0.72,
  "summary": "...",
  "source_news_ids": [1],
  "occurred_at": "2026-06-04"
}
```

首版事件抽取失败时保留原新闻，并标记为 `needs_review`，允许用户在页面手动编辑事件字段。

### 2. 世界状态与 Agent 层

使用内置种子数据初始化 6 个主体和基础关系。

主体字段：

```json
{
  "id": "china",
  "name": "China",
  "type": "country",
  "goals": ["national_security", "economic_growth", "tech_self_reliance"],
  "capabilities": {
    "military": 0.85,
    "economy": 0.9,
    "technology": 0.82,
    "energy": 0.75,
    "diplomacy": 0.8
  }
}
```

关系字段：

```json
{
  "source": "china",
  "target": "usa",
  "friendliness": -0.6,
  "trade_dependency": 0.85,
  "military_tension": 0.75
}
```

SQLite 中保存：

- 新闻记录
- 抽取事件
- 主体种子数据
- 关系快照
- 推演任务
- 每轮 Agent 决策
- 用户干预记录
- 推演分支记录
- 报告内容

Neo4j 不进入 MVP，实现时保留抽象边界，后续可迁移到图数据库。

### 3. 推演引擎

使用 LangGraph 或等价工作流编排方式实现可追踪推演流程。

每次推演流程：

1. 用户选择一个事件。
2. 用户可修改事件强度、影响对象、领域、摘要等参数。
3. 用户选择推演轮数，默认建议 3 轮，可选 1-5 轮。
4. 每轮为每个相关 Agent 生成结构化决策摘要。
5. 用户可通过底部自然语言输入框提交纠正、假设或强制行动。
6. 系统先将自然语言解析为结构化干预，用户确认后再执行。
7. 干预后生成新的推演分支，不覆盖原始推演。
8. 系统保存完整输入、干预、分支和每轮输出，保证可回放、可对比。

Agent 决策输出：

```json
{
  "round": 1,
  "agent": "China",
  "perception": ["The export restriction may affect advanced manufacturing."],
  "goals_considered": ["tech_self_reliance", "economic_growth"],
  "options": [
    {
      "action": "DiplomaticProtest",
      "score": 0.42,
      "reason": "Low cost but limited material effect."
    },
    {
      "action": "IncreaseIndustrialSubsidy",
      "score": 0.81,
      "reason": "Supports long-term technology resilience."
    }
  ],
  "decision": "IncreaseIndustrialSubsidy",
  "confidence": 0.71,
  "citations": [
    {
      "title": "...",
      "source": "Reuters",
      "url": "https://..."
    }
  ]
}
```

风险表达采用“等级 + 百分比估计 + 不确定性说明”：

```json
{
  "risk": "Trade escalation",
  "level": "High",
  "estimated_probability": 0.58,
  "rationale": "...",
  "uncertainty": "Medium"
}
```

### 4. Web 控制台

主要页面采用左侧导航，共 5 个一级模块：

- 态势盘：展示 React Flow 主体关系网络、风险排行榜、关键变量和最近推演入口。
- 新闻事件：展示抓取新闻、来源、发布时间、抽取状态；支持事件编辑和抽取。
- 推演：全屏时间线展示多轮推演，每轮使用 Agent 响应卡片展示决策摘要。
- 报告：展示事件摘要、主体响应、时间线、风险分析、关键变量、来源链接。
- 设置：配置新闻源、模型状态提示、默认推演轮数、默认参与 Agent 和种子数据操作。
- Markdown 导出：导出当前报告为 `.md` 内容。

界面重点：

- 使用 shadcn/ui 的 Table、Card、Tabs、Dialog、Sheet、Select、Slider、Badge、Textarea、Button、Tooltip、Separator。
- 使用 lucide-react 图标和 React Flow 关系网络组件。
- 决策解释采用结构化表格，不展示模型完整内部思考日志。
- 推演页采用时间线 + Agent 卡片，不采用矩阵表格或三栏工作台。
- 人工干预采用底部自由文本输入框，确认解析结果后生成新分支。
- 所有关键判断至少关联来源链接级引用：新闻标题、来源、URL、发布时间。

## Public Interfaces

后端 API 建议：

```text
GET    /api/news
POST   /api/news/fetch
POST   /api/news/extract-events

GET    /api/events
GET    /api/events/{id}
PATCH  /api/events/{id}

GET    /api/agents
GET    /api/world-state

POST   /api/simulations
GET    /api/simulations/{id}
POST   /api/simulations/{id}/interventions
POST   /api/simulations/{id}/rerun
GET    /api/simulations/{id}/branches

GET    /api/reports/{simulation_id}
GET    /api/reports/{simulation_id}/markdown
```

模型配置通过环境变量：

```text
LLM_PROVIDER=openai | deepseek
LLM_API_KEY=...
LLM_BASE_URL=...
LLM_MODEL=...
```

DeepSeek 通过 OpenAI-compatible API 适配，不在业务逻辑中写死供应商 SDK。

## Test Plan

核心测试：

- RSS 抓取：能抓取、去重、保存新闻。
- 事件抽取：给定新闻文本，能返回符合 schema 的事件。
- 事件编辑：用户修改事件字段后，推演使用修改后的版本。
- 推演流程：给定固定事件和固定 mock LLM 输出，能生成指定轮数的 Agent 决策。
- 人工干预：强制某 Agent 行动后，后续轮次使用该行动作为事实输入。
- 分支推演：自然语言干预确认后生成新分支，不覆盖原推演。
- 报告生成：页面报告和 Markdown 内容包含事件摘要、主体响应、时间线、风险、关键变量、来源链接。
- 模型适配器：OpenAI 和 DeepSeek 配置能走同一调用接口。
- 单用户本地：不要求鉴权，但 API 不应依赖用户账号字段。

验收场景：

- 用户点击“抓取新闻”，看到新闻列表更新。
- 用户选择一条新闻并抽取事件。
- 用户编辑事件强度和影响对象。
- 用户选择 3-5 轮推演并运行。
- 用户查看每个 Agent 的感知、目标、候选行动、评分、决策和引用来源。
- 用户通过底部输入框提交纠正或强制行动，确认结构化解析结果后生成新分支。
- 用户导出 Markdown 报告。
- 用户在首页查看主体关系网络、风险排行榜和关键变量。

## Assumptions

- 首版只做本地单用户原型，不做登录、多租户、权限管理。
- 首版用 SQLite，不接 Neo4j；但数据结构保留主体和关系边概念。
- 新闻抓取使用 RSS/公开源，不处理付费新闻 API。
- 风险概率是模型估计值，不作为统计预测结果；页面需要显示不确定性说明。
- 不暴露完整模型内部思考日志，只展示结构化决策摘要。
- 首版默认 6 个 Agent，可在种子数据中扩展，但 UI 和报告按 6 个主体优化。
- 首版不做交互式世界地图；首页主视觉为主体关系网络。
- 前端桌面优先，重点适配 1440px 和 1920px，小屏保证可查看和滚动。
