interface ProgressSectionProps {
  totalTasks: number;
  completedTasks: number;
  isDownloading: boolean;
  subProgress: { current: number; total: number } | null;
}

export function ProgressSection({ 
  totalTasks, 
  completedTasks, 
  isDownloading, 
  subProgress 
}: ProgressSectionProps) {
  if (totalTasks === 0 && !subProgress) return null;

  return (
    <>
      {totalTasks > 0 && (
        <div className="progress-container">
          <div className="progress-status">
            <span>总队列进度: 正在处理第 {Math.min(isDownloading ? completedTasks + 1 : completedTasks, totalTasks)} / {totalTasks} 个链接</span>
            <span>{totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%</span>
          </div>
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      )}

      {subProgress && (
        <div className="progress-container sub-progress">
          <div className="progress-status">
            <span>正在处理当前列表: {subProgress.current} / {subProgress.total}</span>
            <span>{Math.round((subProgress.current / subProgress.total) * 100)}%</span>
          </div>
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill sub-fill" 
              style={{ width: `${(subProgress.current / subProgress.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}
    </>
  );
}
