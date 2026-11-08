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
| `src/main/downloader.ts` | 直接提供查重与 BBDown 执行函数，等待输出关闭并完成历史同步后再处理取消收藏和静默完成通知；取消只影响当前执行实例。 |
| `src/main/downloadProgress.ts` | 在 BBDown 输出边界解析明确的分P消息，分别缓冲标准输出与错误输出的半行。 |
| `src/main/history.ts` | API 与下载器共用历史读取，只有文件不存在才返回空集合。 |
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
→ 主进程广播队列／分P状态和完整日志文本；React 只负责展示。

关闭主窗口 → `BrowserWindow` 销毁但 Electron 主进程与托盘继续运行。
托盘重新打开或普通链接唤醒 → 重建 `BrowserWindow` → `manager-snapshot` 恢复后台队列状态。
托盘设置、剪贴板普通链接通过 `consume-ui-intents` 在界面挂载后恢复。

## 设计决定

- 不更换 Electron、React、TypeScript、BBDown；仅迁移执行权。
- 保留自动下载的每小时 `setInterval(60 * 60 * 1000)`，以及开启功能、进程启动、系统唤醒时的检查。
- 同一时刻只有一个流程占用：准备中的扫描、已有下载队列和当前在途任务共同占用；重复触发直接忽略。
- 暂停取消当前 BBDown 并保留未完成任务；若取消时任务已经成功，则结算为完成，不重复下载。
- execa 的非缓冲 Promise 不代表输出已关闭：正常执行等待 close 后才结束解码、同步历史并结算；同步启动失败直接报告，不等待不存在的输出关闭事件。
- 停止仅阻断新任务并取消当前任务，直到在途操作返回才释放执行权。
- 取消收藏只针对成功下载的收藏夹任务，主进程 API 保留业务结果校验和串行处理。
- 页面关闭不会终止下载；未回答的重新下载弹窗会在窗口关闭时取消，避免阻塞自动扫描。
- 删除旧渲染进程下载 Hook、流程工具和旧下载／收藏夹 IPC；历史测试改为直接调用主进程控制器与业务函数，不为测试保留另一套生产执行入口。
- 查重按输入类型选择解析路径；已识别列表为空直接结束，请求／业务／结构失败向上传递，不返回部分成功，也不自动切换 BBDown 或直接开始下载。既有每次扫描 20 个未下载视频、最多 100 页的限制保持不变。
- 历史读取仅将 ENOENT 视为空集合；其他读取失败停止合并写回。下载后的历史同步失败会结算为失败，不再继续取消收藏或发送静默成功标记。
- 默认收藏夹查询只有明确缺少登录或收藏夹时返回空值；网络、业务和结构错误保留实际原因，由控制器报告。
- 分P进度仅来源于 BBDown 的明确消息，随当前任务发布并在切换、完成、停止时清空；收藏操作日志不参与进度解析。
- 主进程唯一维护日志拼接、回车覆盖和长度限制。事件发送完整日志文本，界面提示与清空命令也交回主进程；新窗口已收到实时日志时不再采用较旧的初始快照。
- 队列完成通知表示所有任务已处理，单项成功／失败以日志为准，不把队列结束当成全部下载成功。

## 开发构建边界

- vite.config.ts 分别构建 React 页面、Electron 主进程和 preload；渲染端保持 contextIsolation=true、nodeIntegration=false，仅使用 preload 提供的 IPC。
- 已移除未使用的 vite-plugin-electron-renderer；不提供 Node 模块到浏览器的转换，因此不再引入其基于 alias.customResolver 的弃用配置。
- 运行依赖由 package.json 声明并由 package-lock.json 锁定，拉取依赖变化后需重新安装；Vite 开发命令不负责补装依赖。
