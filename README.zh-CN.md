# Frontend Promotion Guard

[![CI](https://github.com/Reality-JH/frontend-promotion-guard/actions/workflows/matrix.yml/badge.svg)](https://github.com/Reality-JH/frontend-promotion-guard/actions/workflows/matrix.yml) [![Tag](https://img.shields.io/github/v/tag/Reality-JH/frontend-promotion-guard)](https://github.com/Reality-JH/frontend-promotion-guard/tags) [![License](https://img.shields.io/github/license/Reality-JH/frontend-promotion-guard)](./LICENSE)

中文是本项目的翻译入口。[English](./README.md) · [v0.3.0 更新说明](./docs/v0.3.0-release.zh-CN.md) · [中文发布文章](./docs/launch-post.zh-CN.md)

Frontend Promotion Guard（FPG）是一道独立的前端发布门禁。它针对一种常见事故：构建成功、HTTP 返回 200、容器健康，但线上 CSS 已丢失、布局损坏或页面视觉退化。

FPG 在晋升正式镜像前依次检查构建后 CSS 语义、浏览器真实计算样式和多路由多宽度截图；候选容器通过后才晋升，正式环境复验失败则恢复上一镜像。每次运行都会生成可直接打开的静态 HTML 报告。

它不替代功能测试、安全测试和人工验收。视觉基线必须由人确认页面正确后显式更新。

![verify 先在健康的示例站上通过，随后同一命令在返回 HTTP 200 但样式表为空的服务上失败](./docs/assets/fpg-verify-demo.svg)

## 按当前事项选择最小门禁

FPG 不是每次前端改动后的强制部署步骤。应按当前目标选择层级：

| 层级 | 何时执行 | 命令与边界 |
| --- | --- | --- |
| 单项检查 | 单个功能或缺陷仍在开发 | 先运行项目自身的定向测试。只有风险位于构建后 CSS 时才运行 `fpg audit`；它不会启动浏览器、构建镜像、重启服务或检查无关路由。 |
| 模块门禁 | 一组相关事项已在运行中的目标上收口 | 对配置的路由和视口运行 `fpg verify`；它只观察现有目标，不构建镜像、不重启服务、不晋升版本。 |
| 发布门禁 | 已明确要求部署或发布、必须在已部署环境验收，或已经到达约定的批次发布节点 | 运行 `fpg promote`；它会构建或启动候选环境，通过验收后改变容器状态，并在正式环境复验失败时尝试回退。 |

FPG 报告通过只证明配置中的发布检查通过，不能证明当前功能的业务闭环已经完成。应先完成定向业务验证，再升级到更宽的门禁；共享门禁按约定批次执行一次，不要为每个清单项重复执行。

## 它要拦住的事故

下面两张图展示了一类很容易漏过的发布事故：构建成功、HTTP 返回 200，但页面布局已经坏了。左图是前端资源没有正确生效时的结果，右图是资源恢复后的页面。

| 发布后已损坏 | 正常渲染 |
| --- | --- |
| ![损坏的前端布局](./docs/assets/frontend-css-broken.png) | ![正常的前端布局](./docs/assets/frontend-css-restored.png) |

这两张图是事故示意，不是本仓库的视觉基线。FPG 用 CSS 产物检查、计算样式断言和截图对比，在晋升前拦截同类问题。

## 快速开始

要求 Node.js 20+，以及本机 Chrome 或 Edge。Docker 仅在使用 `promote`/`rollback` 时需要。

```bash
npm install
npm run build
cp fpg.example.yml fpg.yml
node dist/cli.js audit --config fpg.yml
node dist/cli.js baseline update --config fpg.yml
node dist/cli.js verify --config fpg.yml
```

Windows PowerShell 也可直接执行：

```powershell
.\scripts\fpg.ps1 verify --config .\fpg.yml
```

如果未配置 `browserPath`，FPG 会优先查找系统 Chrome/Edge。也可设置 `FPG_BROWSER_PATH`。它使用 `playwright-core`，不会自动下载浏览器。

## 配置

完整最小示例见 [`fpg.example.yml`](./fpg.example.yml)。以下字段均可配置：

- `routes`：路由、名称和就绪选择器。
- `viewports`：截图宽高。
- `cssAudit`：CSS glob、禁止的源指令和必须存在的选择器。
- `computedStyles`：选择器、CSS 属性、`equals` 或 `notEquals`。
- `visual`：像素阈值、基线目录、证据目录和保留运行数。
- `docker`：候选/正式镜像、容器、端口、容器端口、构建上下文、Dockerfile、附加参数、健康路由和回退开关。

相对路径均以配置文件所在目录为基准。Windows `\` 和 Linux `/` 风格的 CSS glob 都受支持。证据与基线目录应指向有足够空间的工作盘。

## CLI

```text
fpg audit
fpg capture
fpg compare
fpg verify
fpg baseline update
fpg promote
fpg rollback IMAGE
fpg report
```

- `audit`：只检查构建 CSS。
- `capture`：采集当前截图与计算样式，不修改基线。
- `compare`：计算样式与截图回归；缺少基线即失败。
- `verify`：`audit + compare`。
- `baseline update`：唯一允许写入基线的命令，必须显式执行。
- `promote`：隔离启动候选容器并验收，随后晋升；正式复验失败自动回退。
- `rollback IMAGE`：显式恢复指定不可变镜像。
- `report`：重新生成最近一次运行的 HTML 报告。

测试失败永远不会覆盖基线。报告含基线图、当前图、差异图、不可变镜像 ID、Git commit、运行环境与浏览器版本、阶段耗时、测试结果、最终生产状态和回退信息。

配置会在浏览器或 Docker 操作开始前完成运行时校验。启用 `docker.requireImmutableImage: true` 后，已有候选镜像和显式回退参数必须使用 digest 或镜像 ID。即使配置使用普通标签，报告仍会记录候选、晋升前正式环境和最终正式环境的实际镜像 ID。

`promote` 和 `rollback` 共用仓库本地发布锁。并发操作会失败，并显示锁持有者的 PID、开始时间和 commit。CI 还应配置工作流原生的 `concurrency`，因为本地锁无法协调不同 runner。

## GitHub Actions 最小接入

```yaml
- uses: Reality-JH/frontend-promotion-guard@v0.3.0
  with:
    config: fpg.yml
    command: verify
- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: frontend-promotion-evidence
    path: release-evidence
```

调用前需要完成项目构建、启动待测服务，并确保 runner 有 Chrome。可执行的 Vite/React 启动流程见 [`.github/workflows/example.yml`](./.github/workflows/example.yml)，跨平台矩阵见 [`.github/workflows/matrix.yml`](./.github/workflows/matrix.yml)。发布版 Action 必须包含构建后的 `dist/`、`package.json` 和 `package-lock.json`。

Action 默认执行不会改变容器状态的 `verify`。只有明确的发布工作流使用 `command: promote` 时，才同时设置 `confirm-promotion: true`；普通 Pull Request 和功能开发工作流不应设置该开关。

## 常见问题

**构建通过、健康检查是绿的，但部署后的页面没有样式。什么能拦住？**
这正是 FPG 针对的事故。`verify` 用真实 Chrome 或 Edge 打开已部署页面并断言计算样式：在仓库自带的断 CSS 演示中，页面以 HTTP 200 返回空样式表，像素差异停在 5.537% 低于 12% 配置上限，但计算样式断言因 `.status-grid` 计算出 `block` 而非 `grid` 判定运行失败。`audit` 拦截的是相邻的一类失败：构建产出的 CSS 根本没有编译。

**它与 Percy、Chromatic、BackstopJS 或 Playwright 截图测试有什么区别？**
这些工具覆盖视觉审查，或提供搭建门禁的框架。FPG 是一道自包含的发布门禁：附加构建 CSS 产物检查、计算样式断言、溢出与控制台检查、带可验证回退的 Docker 候选晋升，以及静态 HTML 证据报告。它跑在你自己的 runner 上，用系统浏览器，证据就是本地文件，不依赖 SaaS 面板。

**它能替代功能测试或端到端测试吗？**
不能。FPG 验收的是交付后的页面是否仍与批准的基线一致。它不会执行业务流程点击，也不能替代功能测试、安全测试、可访问性检查或新页面的人工验收。

## 维护者与联系

维护者：`Reality-JH`。普通问题通过仓库 Issues 联系；安全问题发送至 `849034843@qq.com`，不要在公开 Issue 中粘贴凭据、Cookie、Token 或业务数据。

## 持续许可证扫描

```bash
npm run license:check
```

CI 每次推送和 Pull Request 都执行生产依赖许可证扫描，并运行 npm 高等级生产依赖漏洞审计；当前允许列表与许可证结果见 [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md)。新增依赖若使用未允许许可证，扫描会失败。

## Docker 平台矩阵

`.github/workflows/matrix.yml` 使用 Node 20 和 22，在 Ubuntu、Windows 和 macOS 上执行浏览器、测试和许可证检查。Ubuntu Docker 任务会完整执行四种场景：正常晋升、候选失败且正式环境不变、正式复验失败后验证恢复、回退验收失败。每种场景都会核对最终正式容器的镜像 ID。

## 基线审批

`baseline update` 会生成 `visual-baselines/manifest.json`，记录每张已批准图片的 SHA-256。GitHub Action 刻意不允许更新基线。应在本地显式更新，人工检查旧图、当前图和差异图，再通过 Pull Request 提交图片与清单变化。对像素稳定性要求较高时，应固定 runner 操作系统、浏览器大版本和字体。

## Docker 晋升模型

`promote` 读取当前正式容器的镜像 ID并标记为时间戳回退镜像；可选构建候选镜像，在独立容器和端口运行完整视觉验收。通过后把候选镜像标记为正式镜像并重建正式容器，再次执行完整验收。正式复验失败时，FPG 用保留镜像重建正式容器并验证恢复结果。

所有外部命令均用参数数组执行，不经过 shell 拼接。默认日志会遮盖常见 Cookie、Authorization、Token、API key、password 和 secret 值；配置文件仍不得保存业务密钥。

## 开发验证

```bash
npm run typecheck
npm run build
npm test
npm run example:build
```

示例位于 `examples/vite-react`。许可证选择与依赖审计见 [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md)。
