# 下载流程架构

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `src/shared/download.ts` | 主进程与渲染进程共用的下载任务、队列状态和查重结果类型。 |
| `src/main/downloadManager.ts` | 唯一下载流程控制器：入口互斥、扫描准备、任务队列、暂停、停止、清理及状态广播。 |
| `src/main/downloadRuntime.ts` | 将控制器与真实 B 站 API、BBDown、Electron IPC、桌面通知连接。 |
| `src/main/scheduler.ts` | 每小时检查自动下载开关、启动时及系统唤醒触发；直接调用控制器，不依赖窗口。 |
| `src/main/clipboard.ts` | 每秒读取剪贴板；静默命令直接调用控制器，普通视频链接激活主界面。 |
| `src/main/window.ts` | 管理托盘、主窗口、打开设置和剪贴板意图；关闭到托盘时销毁 Chromium 窗口。 |
| `src/main/downloader.ts` | 执行 BBDown、同步下载历史、成功后取消收藏，向控制器提供可取消的执行任务。 |
| `src/main/api.ts` | B 站账户、默认收藏夹、转存、串行取消收藏等业务操作。 |
| `src/main/settings.ts` | 权威配置存储。 |
| `src/renderer/hooks/useDownloadMain.ts` | 只保留输入、弹窗和展示状态；用 IPC 读取控制器状态。 |
| `src/renderer/App.tsx` | 挂载 UI、恢复新建窗口的打开设置和剪贴板意图。 |
| `src/preload.ts` / `src/vite-env.d.ts` | 显式声明主进程命令和只读状态事件 IPC。 |
| `tests/main-process-manager.test.cjs` | 主进程控制器的竞争、无窗口执行、停止和暂停回归测试。 |
| `tests/window-lifecycle.test.cjs` | 关闭到托盘释放窗口、重新打开和 UI 意图恢复测试。 |
| `tests/helpers/downloadHarness.cjs` | 真实源码隔离测试工具。 |

## 关键调用关系

用户手动触发／定时器每小时轮询／浏览器扩展剪贴板静默指令
→ `DownloadManager.begin()` 同步取得独占执行权
→ 由主进程直接调用 B 站 API 扫描／取消收藏
→ 主进程队列逐项调用 BBDown 并等待历史同步和取消收藏结束
→ 主进程广播状态和日志；React 只负责展示。

关闭主窗口 → `BrowserWindow` 销毁但 Electron 主进程与托盘继续运行。
托盘重新打开或普通链接唤醒 → 重建 `BrowserWindow` → `manager-snapshot` 恢复后台队列状态。
托盘设置、剪贴板普通链接通过 `consume-ui-intents` 在界面挂载后恢复。

## 设计决定

- 不更换 Electron、React、TypeScript、BBDown；仅迁移执行权。
- 保留自动下载的每小时 `setInterval(60 * 60 * 1000)`，以及开启功能、进程启动、系统唤醒时的检查。
- 同一时刻只有一个流程占用：准备中的扫描、已有下载队列和当前在途任务共同占用；重复触发直接忽略。
- 暂停取消当前 BBDown 并保留未完成任务；若取消时任务已经成功，则结算为完成，不重复下载。
- 停止仅阻断新任务并取消当前任务，直到在途操作返回才释放执行权。
- 取消收藏只针对成功下载的收藏夹任务，主进程 API 保留业务结果校验和串行处理。
- 页面关闭不会终止下载；未回答的重新下载弹窗会在窗口关闭时取消，避免阻塞自动扫描。
- `src/renderer/hooks/useDownload.ts` 等旧 Hook/流程模块仍留在仓库供既有历史回归测试使用，但应用运行入口已经切换到 `useDownloadMain.ts`；需要在完成新架构验收后清理旧测试依赖。
