# GlobalSim TaskBoard

> Product specs: see `plan.md` and `frontend.md`.

## Phase 0: 项目初始化与开发基线

### Goal

建立可运行、可测试、可扩展的全栈项目骨架。

### Tasks

- [ ] 创建 Python + FastAPI 后端项目结构。
- [ ] 创建 React + shadcn/ui 前端项目结构。
- [ ] 配置 SQLite、本地环境变量、基础启动脚本。
- [ ] 配置测试框架：后端 pytest，前端单测或组件测试，E2E 使用 Playwright。
- [ ] 提供基础 README 启动说明。

### User Acceptance

- [ ] 用户能启动后端和前端。
- [ ] 浏览器能打开空的 GlobalSim 控制台外壳。

### Technical Acceptance

- [ ] 后端健康检查接口可访问。
- [ ] 前端构建通过。
- [ ] 基础测试命令可运行。

### Suggested Checks

```text
pytest
npm run build
npx playwright test --list
```

## Phase 1: 数据模型与种子世界状态

### Goal

建立 SQLite 数据层和 6 个核心主体的内置世界状态。

### Tasks

- [ ] 定义新闻、事件、Agent、关系、推演、分支、报告的数据表。
- [ ] 写入 China、USA、Russia、EU、NATO、UN 种子数据。
- [ ] 写入基础关系边和能力指标。
- [ ] 提供 `/api/agents` 和 `/api/world-state`。
- [ ] 支持重置或重新导入种子数据。

### User Acceptance

- [ ] 前端或 API 能看到 6 个主体及其关系。
- [ ] 设置页能显示当前种子数据状态。

### Technical Acceptance

- [ ] 数据库初始化可重复执行。
- [ ] `/api/agents` 返回主体列表。
- [ ] `/api/world-state` 返回节点和边。

## Phase 2: 前端应用框架与态势盘

### Goal

完成左侧导航、现代 SaaS 外壳和首页关系网络。

### Tasks

- [ ] 实现 5 个一级页面：态势盘、新闻事件、推演、报告、设置。
- [ ] 使用 React Flow 展示 6 个主体关系网络。
- [ ] 实现节点详情和边详情侧栏。
- [ ] 实现风险排行榜、关键变量、最近推演入口的静态或 seed 数据展示。
- [ ] 完成桌面优先布局，重点适配 1440px 和 1920px。

### User Acceptance

- [ ] 首页能看到主体关系网络。
- [ ] 点击节点能查看主体目标和能力指标。
- [ ] 点击边能查看双边关系指标。

### Technical Acceptance

- [ ] React Flow 渲染非空节点和边。
- [ ] 页面切换不刷新整页。
- [ ] Playwright 能验证首页核心元素存在。

## Phase 3: RSS 新闻抓取与新闻事件页

### Goal

接入真实 RSS/公开源，完成新闻入库、去重和展示。

### Tasks

- [ ] 实现新闻源配置。
- [ ] 实现手动抓取接口 `/api/news/fetch`。
- [ ] 实现新闻去重指纹。
- [ ] 实现 `/api/news` 列表接口。
- [ ] 前端新闻事件页展示新闻表格、筛选和详情抽屉。
- [ ] 设置页支持查看和启用/停用新闻源。

### User Acceptance

- [ ] 用户点击“抓取新闻”后能看到新闻列表更新。
- [ ] 用户能按来源、时间、抽取状态筛选新闻。
- [ ] 用户能打开新闻来源链接。

### Technical Acceptance

- [ ] 重复抓取不会重复入库。
- [ ] RSS 抓取失败时有错误状态，不阻断已有新闻查看。
- [ ] RSS 抓取相关单测通过。

## Phase 4: Mock 事件抽取与事件编辑

### Goal

在不依赖真实 LLM 的情况下打通新闻到结构化事件的流程。

### Tasks

- [ ] 实现事件数据模型和 `/api/events`。
- [ ] 实现 mock 事件抽取器。
- [ ] 实现 `/api/news/extract-events`。
- [ ] 支持事件字段编辑：actor、targets、action、domain、intensity、summary、occurred_at。
- [ ] 抽取失败时标记 `needs_review`。

### User Acceptance

- [ ] 用户能从新闻生成结构化事件。
- [ ] 用户能编辑事件强度、主体、领域和摘要。
- [ ] 待审事件能被明确标记。

### Technical Acceptance

- [ ] 给定固定新闻，mock 抽取返回稳定 schema。
- [ ] 事件编辑后持久化生效。
- [ ] API schema 测试通过。

## Phase 5: 基础推演闭环

### Goal

使用 seed/mock 逻辑完成事件到多轮 Agent 决策再到页面展示的闭环。

### Tasks

- [ ] 实现 `/api/simulations` 创建推演。
- [ ] 支持用户选择事件、参与 Agent、推演轮数 1-5。
- [ ] 使用 mock 推演器生成每轮 Agent 决策。
- [ ] 推演页展示全屏时间线和 Agent 响应卡片。
- [ ] 保存每轮感知、目标、候选行动、评分、决策、置信度和引用来源。

### User Acceptance

- [ ] 用户能选择一个事件并运行 3-5 轮推演。
- [ ] 用户能按时间线查看每轮 Agent 响应卡片。
- [ ] 每个 Agent 决策都有结构化依据。

### Technical Acceptance

- [ ] 固定输入生成稳定推演结果。
- [ ] 推演结果可通过 `/api/simulations/{id}` 回放。
- [ ] 推演流程单测通过。

## Phase 6: LLM 适配与真实抽取/推演

### Goal

中期接入真实 OpenAI/DeepSeek，但保持 mock 模式可用。

### Tasks

- [ ] 实现统一 LLM adapter。
- [ ] 支持 `LLM_PROVIDER=openai|deepseek`。
- [ ] 支持 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`。
- [ ] 将事件抽取替换为可配置 LLM 输出。
- [ ] 将 Agent 决策生成替换为可配置 LLM 输出。
- [ ] 保留 mock provider 作为测试和离线开发模式。
- [ ] 设置页显示模型配置状态。

### User Acceptance

- [ ] 用户配置 OpenAI 或 DeepSeek 后，事件抽取和推演使用真实模型。
- [ ] 未配置模型时，系统能回退到 mock 或显示明确状态。

### Technical Acceptance

- [ ] OpenAI-compatible DeepSeek 接入不侵入业务逻辑。
- [ ] LLM 输出经过 schema 校验。
- [ ] mock provider 测试稳定通过。

## Phase 7: 自然语言干预与分支推演

### Goal

实现底部自由文本干预、解析确认和新分支生成。

### Tasks

- [ ] 推演页底部实现固定自然语言输入框。
- [ ] 实现干预解析接口 `/api/simulations/{id}/interventions`。
- [ ] 展示结构化解析结果并要求用户确认。
- [ ] 确认后生成新推演分支，不覆盖原始推演。
- [ ] 实现 `/api/simulations/{id}/branches`。
- [ ] 支持分支切换和分支命名。

### User Acceptance

- [ ] 用户输入“假设欧盟不跟进制裁”后能看到系统解析结果。
- [ ] 用户确认后生成新分支。
- [ ] 原始推演仍可查看。
- [ ] 用户能在多个分支之间切换。

### Technical Acceptance

- [ ] 干预记录和分支记录持久化。
- [ ] 新分支从指定轮次或当前推演上下文继续生成。
- [ ] 分支推演测试验证“不覆盖原始结果”。

## Phase 8: 报告与 Markdown 导出

### Goal

生成研究简报式报告，并支持 Markdown 导出。

### Tasks

- [ ] 实现 `/api/reports/{simulation_id}`。
- [ ] 实现 `/api/reports/{simulation_id}/markdown`。
- [ ] 报告页展示事件摘要、关键判断、主体响应、时间线、风险分析、关键变量、来源链接。
- [ ] 风险展示等级、估计百分比和不确定性。
- [ ] Markdown 导出保留结构化章节和来源链接。

### User Acceptance

- [ ] 用户能从一次推演生成研究简报。
- [ ] 用户能导出 Markdown。
- [ ] 报告中能看到风险等级、概率估计、不确定性和引用来源。

### Technical Acceptance

- [ ] 报告生成对同一推演结果稳定。
- [ ] Markdown 输出包含全部必要章节。
- [ ] 报告 API 测试通过。

## Phase 9: 端到端验收与质量收敛

### Goal

完成自动化 E2E、桌面适配和 MVP 交付检查。

### Tasks

- [ ] 编写 Playwright E2E 覆盖核心流程。
- [ ] 验证 1440px 和 1920px 下主要页面不重叠、不截断。
- [ ] 验证小屏可滚动查看核心信息。
- [ ] 补齐错误态、加载态、空态。
- [ ] 整理 README 的启动、配置、测试、演示流程。
- [ ] 对照 `plan.md` 和 `frontend.md` 做 MVP 功能核对。

### User Acceptance

- [ ] 用户可以完成完整流程：抓取新闻、抽取事件、编辑事件、运行推演、输入干预、生成分支、导出报告。
- [ ] 主要页面在桌面分辨率下可读、可操作、无明显布局错误。

### Technical Acceptance

- [ ] 后端测试通过。
- [ ] 前端构建通过。
- [ ] Playwright E2E 核心流程通过。
- [ ] README 能指导新环境启动项目。

### Suggested Checks

```text
pytest
npm run build
npx playwright test
```

### Core E2E Flow

```text
打开态势盘
抓取新闻
抽取事件
编辑事件
创建 3 轮推演
查看 Agent 卡片
输入自然语言干预
确认解析结果
生成新分支
打开报告
导出 Markdown
```

## Assumptions

- TaskBoard 只负责阶段、任务和验收，不重复 `plan.md` 与 `frontend.md` 的完整产品描述。
- 实现采用闭环优先：seed/mock 先跑通，真实 RSS 早期接入，真实 LLM 中期接入，分支推演后期作为核心能力完成。
- 每阶段都必须能独立验收，不接受“等最后一起验证”。
- E2E 采用 Playwright，核心流程必须自动化覆盖。
- TaskBoard.md 创建时不执行实现，只写任务板。
