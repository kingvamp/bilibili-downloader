# 当前工作上下文

- 当前正在做什么：已修复开发启动缺少运行依赖及 Vite customResolver 弃用警告，保留既有后台下载架构。
- 上次停在什么位置：本机缺少已锁定的 electron-store 8.2.0、execa 8.0.1、fast-glob 3.3.3，现已补齐；移除渲染端未使用的 vite-plugin-electron-renderer，其余锁定版本未变。56 项回归、TypeScript/Vite 构建和本次构建的隔离 Electron 主进程/preload/React/设置/认证冒烟通过，构建无该弃用警告。临时配置、隐藏窗口、剪贴板隔离及 HTTP 守卫下零网络尝试；未验证真实登录、下载、用户现有配置或新安装包。
- 本次修改的提交说明：fix(dev): 恢复锁定运行依赖并移除未使用的 Electron 渲染插件（2026-10-21）；对抗性审查确认 IPC 边界、依赖版本与业务代码保持一致。
