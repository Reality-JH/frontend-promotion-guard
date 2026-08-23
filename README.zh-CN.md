# Frontend Promotion Guard

中文是本项目的翻译入口。[English](./README.md) · [中文发布文章](./docs/launch-post.zh-CN.md) · [English launch article](./docs/launch-post.md)

Frontend Promotion Guard（FPG）是一道独立的前端发布门禁。它针对一种常见事故：构建成功、HTTP 返回 200、容器健康，但线上 CSS 已丢失、布局损坏或页面视觉退化。

FPG 在晋升正式镜像前依次检查构建后 CSS 语义、浏览器真实计算样式和多路由多宽度截图；候选容器通过后才晋升，正式环境复验失败则恢复上一镜像。每次运行都会生成可直接打开的静态 HTML 报告。

它不替代功能测试、安全测试和人工验收。视觉基线必须由人确认页面正确后显式更新。

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

测试失败永远不会覆盖基线。报告含基线图、当前图、差异图、镜像标识、Git commit、测试结果和回退信息。

## GitHub Actions 最小接入

```yaml
- uses: Reality_JH/frontend-promotion-guard@v0.1.0
  with:
    config: fpg.yml
    command: verify
- if: always()
  uses: actions/upload-artifact@v4
  with:
    name: frontend-promotion-evidence
    path: release-evidence
```

上面的引用需要在 `Reality_JH/frontend-promotion-guard` 正式创建并发布 `v0.1.0` 后启用；当前本地仓库尚未创建远程仓库。调用前需要完成项目构建、启动待测服务，并确保 runner 有 Chrome。可执行的 Vite/React 启动流程见 [`.github/workflows/example.yml`](./.github/workflows/example.yml)，跨平台矩阵见 [`.github/workflows/matrix.yml`](./.github/workflows/matrix.yml)。发布版 Action 必须包含构建后的 `dist/`、`package.json` 和 `package-lock.json`。

## 维护者与联系

维护者：`Reality_JH`。普通问题通过仓库 Issues 联系；安全问题发送至 `849034843@qq.com`，不要在公开 Issue 中粘贴凭据、Cookie、Token 或业务数据。

## 持续许可证扫描

```bash
npm run license:check
```

CI 每次推送和 Pull Request 都执行生产依赖许可证扫描；当前允许列表与审计结果见 [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md)。新增依赖若使用未允许许可证，扫描会失败。

## Docker 平台矩阵

`.github/workflows/matrix.yml` 在 Ubuntu、Windows 和 macOS 上执行 Node、浏览器、测试和许可证检查，并在 Ubuntu 上执行真实 Docker 构建。Docker 候选晋升仍建议在实际 Docker Desktop/Linux runner 上按项目配置执行；不同平台的镜像运行时、端口占用和浏览器路径必须以实际 runner 为准。

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
