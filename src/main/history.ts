// 下载历史读取：API 与下载器共用，只有文件尚未创建时才视为空历史。
// 关联：state.ts 提供历史路径；调用方负责合并、写回或报告读取失败。
import fs from 'fs';
import { AppPaths } from './state';

/** 读取去重后的 BV 记录；权限、锁定等读取错误必须交给调用方处理。 */
export function readDownloadHistory(): Set<string> {
  let content: string;
  try {
    content = fs.readFileSync(AppPaths.historyPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw error;
  }
  return new Set(content.split(/\r?\n/).map(value => value.trim()).filter(Boolean));
}
