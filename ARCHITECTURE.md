# 下载流程架构

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `src/renderer/hooks/useDownload.ts` | 统一所有入口、维护显示状态并逐个执行所属流程的下载任务。 |
| `src/renderer/utils/downloadWorkflow.ts` | 同步管理唯一流程、准备阶段、待执行数量和在途任务的生命周期。 |
| `src/renderer/utils/defaultFavorites.ts` | 在已取得执行权的流程内查询默认收藏夹、扫描、清理历史并入队。 |
| `src/renderer/components/sections/DownloadForm.tsx` | 根据流程占用状态禁用重复启动入口。 |
| `src/main/scheduler.ts` | 按现有启动、开关、唤醒和轮询规则发出调度通知，不独立查询收藏夹。 |
| `src/preload.ts` / `src/vite-env.d.ts` | 定义并转发渲染进程与主进程的 IPC 接口。 |
| `src/main/downloader.ts` | 执行 BBDown，同步下载历史，等待取消收藏完成后发送任务完成事件。 |
| `src/main/api.ts` | 查询账号／收藏夹、执行收藏操作，并串行处理所有取消收藏请求。 |
| `tests/helpers/downloadHarness.cjs` | 隔离加载实际源码并提供可控制异步时序的测试环境。 |

## 调用关系和设计决定

所有入口 → `useDownload` → `DownloadWorkflow.begin()` → 查询／扫描／清理 → 入队 → BBDown → 历史同步／取消收藏 → 完成事件 → 结算队列和释放流程。

执行权由同步控制器唯一管理，React 状态仅供显示，避免同一轮渲染前的重复触发。任务携带所属流程，旧队列回调不能执行新流程里的任务。

准备结束并不释放有待执行任务的流程。暂停后等待当前任务结束再恢复；如果任务已经成功则结算该任务，不重复执行。停止后仍等待在途操作返回，旧流程不会继续入队或启动新请求。

定时器只通知统一入口，默认收藏夹查询也受同一流程控制。下载完成和历史清理共同使用主进程取消收藏队列，失败明确返回错误且不阻塞后续请求。
