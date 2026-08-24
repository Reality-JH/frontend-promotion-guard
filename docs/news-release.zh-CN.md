# Frontend Promotion Guard v0.2.0 发布

## 一道专门拦截“健康检查通过但前端已经坏了”的开源发布门禁

**可立即发布**

开源项目 Frontend Promotion Guard（FPG）v0.2.0 现已发布。它提供 Node.js CLI 和可复用的 GitHub Action。

很多发布流程在构建成功、HTTP 返回 200、容器健康后就结束了。这些信号无法证明浏览器拿到了可用的 CSS，也无法证明页面仍然符合团队批准过的版本。FPG 把这一步补进发布流程。

FPG 可以：

- 检查构建后的 CSS 是否残留源指令，以及必需选择器是否缺失；
- 在 Chrome 或 Edge 中断言真实计算样式；
- 按配置对多条路由和多个视口进行截图对比；
- 在晋升前验收候选 Docker 容器；
- 正式环境复验失败时恢复上一镜像；
- 生成包含截图、差异图、commit、测试结果和回退状态的静态 HTML 报告。

工具使用 YAML 配置，支持 Windows、Linux 和 GitHub Actions。只做 CSS、浏览器和截图检查时不要求安装 Docker。视觉基线只能通过显式命令更新，失败的测试不会悄悄覆盖已批准的图片。

0.2.0 重点补强发布证据。公开 CI 现在会执行正常晋升、候选失败、正式复验失败后恢复、回退验收失败四种场景。报告会记录实际 Docker 镜像 ID、最终生产状态、各阶段时间和浏览器运行环境。本次还增加了配置前置校验、仓库本地发布锁、可选的不可变镜像约束、基线 SHA-256 清单，以及更安全的 GitHub Action 输入处理。

FPG 的边界很明确。它不能替代功能测试、安全测试、可访问性检查或人工验收。它只负责拦截一种反复出现的事故：部署在技术指标上健康，但用户在浏览器里看到的页面已经损坏。

仓库：https://github.com/Reality-JH/frontend-promotion-guard

维护者：Reality_JH

安全联系：849034843@qq.com

## 可直接发布的短文案

构建成功，HTTP 200，容器健康，前端却坏了。

Frontend Promotion Guard 把 CSS 产物检查、真实浏览器计算样式断言、多视口截图对比、候选 Docker 验收和自动回退证据接入发布流程。

开源、YAML 配置，支持 Node.js、PowerShell、Linux 和 GitHub Actions。

https://github.com/Reality-JH/frontend-promotion-guard
