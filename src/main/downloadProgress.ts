// BBDown 进度解析：仅接受明确的总数和分P消息；跨块、双输出流的半行分别保留。
// 关联：downloader.ts 消费子进程输出，DownloadManager 持有并广播解析后的进度。
import type { DownloadProgress } from '../shared/download';

/** 每个下载任务创建独立解析器，不从分辨率或无上下文的数字比例猜测进度。 */
export function createDownloadProgressParser(onProgress: (progress: DownloadProgress) => void) {
  const pending = { stdout: '', stderr: '' };
  let total = 0;
  let current = 0;

  /** 只在完整语句中读取明确计数，并保证发布值落在总数范围内。 */
  const parseLine = (raw: string) => {
    const line = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] - /, '');
    // 只匹配日志消息开头，避免标题文本和其他资源计数误当成分P进度。
    const totalMatch = line.match(/^共计\s*(\d+)\s*个分P(?:\s*[,，]|\s*$)/);
    const partMatch = line.match(/^开始下载P(\d+)(?:视频|音频|背景配音|配音|片段)/)
      || line.match(/^下载P(\d+)完毕/);
    if (!totalMatch && !partMatch) return;
    if (totalMatch) {
      total = Number(totalMatch[1]);
      current = 0;
    }
    if (partMatch) current = Number(partMatch[1]);
    if (Number.isSafeInteger(total) && Number.isSafeInteger(current)
      && total > 0 && current >= 0 && current <= total) {
      onProgress({ current, total });
    }
  };

  return {
    /** 按换行或回车切出完整消息；stdout 与 stderr 的半行不能互相拼接。 */
    write(stream: 'stdout' | 'stderr', chunk: string): void {
      const lines = (pending[stream] + chunk).split(/[\r\n]/);
      pending[stream] = lines.pop()!;
      for (const line of lines) parseLine(line);
    },
    /** 子进程结束时消费没有换行符的最后一行。 */
    finish(): void {
      parseLine(pending.stdout);
      parseLine(pending.stderr);
      pending.stdout = '';
      pending.stderr = '';
    }
  };
}
