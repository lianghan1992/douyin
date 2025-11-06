import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { TaskDetails, TaskStatus, StoredTask } from '../types';
import { UploadIcon, SpinnerIcon, DownloadIcon, RefreshIcon, CheckCircleIcon, XCircleIcon, ClockIcon, VideoIcon } from './icons';

interface MainPageProps {
  token: string;
  onLogout: () => void;
}

const UploadSection: React.FC<{ token: string; onTaskCreated: (task: StoredTask) => void; }> = ({ token, onTaskCreated }) => {
    const [sourceVideo, setSourceVideo] = useState<File | null>(null);
    const [materialVideo, setMaterialVideo] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState('');
    const [min_duration, setMinDuration] = useState(45);
    const [max_duration, setMaxDuration] = useState(60);
    const [slowdown_factor, setSlowdownFactor] = useState<number | null>(null);
    const [effect, setEffect] = useState('vflip');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'source' | 'material') => {
        if (e.target.files && e.target.files[0]) {
            if (fileType === 'source') setSourceVideo(e.target.files[0]);
            else setMaterialVideo(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sourceVideo || !materialVideo) {
            setMessage('请选择源视频和素材视频。');
            return;
        }
        setIsUploading(true);
        setMessage('');
        try {
            const response = await api.createTask(sourceVideo, materialVideo, token, min_duration, max_duration, slowdown_factor, effect);
            if (response?.task_id) {
                setMessage(`任务创建成功！任务ID: ${response.task_id}`);
                onTaskCreated({ id: response.task_id, createdAt: new Date().toISOString() });
                setSourceVideo(null);
                setMaterialVideo(null);
                 // Clear message after 3 seconds
                setTimeout(() => setMessage(''), 3000);
            }
        } catch (error: any) {
            setMessage(`任务创建失败: ${error.message || '请稍后重试。'}`);
        } finally {
            setIsUploading(false);
        }
    };

    const FileInput: React.FC<{id: string, label: string, file: File | null, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void}> = ({id, label, file, onChange}) => (
      <div className="w-full">
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <VideoIcon className="mx-auto h-12 w-12 text-gray-400"/>
            <div className="flex text-sm text-gray-600">
              <label htmlFor={id} className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                <span>上传文件</span>
                <input id={id} name={id} type="file" accept="video/*" className="sr-only" onChange={onChange} disabled={isUploading}/>
              </label>
              <p className="pl-1">或拖拽到此处</p>
            </div>
            <p className="text-xs text-gray-500">{file ? file.name : 'MP4, MOV, etc.'}</p>
          </div>
        </div>
      </div>
    );

    return (
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">创建新任务</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                    <FileInput id="source-video" label="源视频" file={sourceVideo} onChange={e => handleFileChange(e, 'source')} />
                    <FileInput id="material-video" label="素材视频" file={materialVideo} onChange={e => handleFileChange(e, 'material')} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="min_duration" className="block text-sm font-medium text-gray-700">最小持续时间 (秒)</label>
                        <input type="number" name="min_duration" id="min_duration" value={min_duration} onChange={e => setMinDuration(parseInt(e.target.value))} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                    </div>
                    <div>
                        <label htmlFor="max_duration" className="block text-sm font-medium text-gray-700">最大持续时间 (秒)</label>
                        <input type="number" name="max_duration" id="max_duration" value={max_duration} onChange={e => setMaxDuration(parseInt(e.target.value))} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                    </div>
                    <div>
                        <label htmlFor="slowdown_factor" className="block text-sm font-medium text-gray-700">减速因子 (可选)</label>
                        <input type="number" step="0.1" name="slowdown_factor" id="slowdown_factor" value={slowdown_factor ?? ''} onChange={e => setSlowdownFactor(e.target.value ? parseFloat(e.target.value) : null)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                    </div>
                    <div>
                        <label htmlFor="effect" className="block text-sm font-medium text-gray-700">效果</label>
                        <select id="effect" name="effect" value={effect} onChange={e => setEffect(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                            <option value="vflip">垂直翻转</option>
                            <option value="hflip">水平翻转</option>
                            <option value="grayscale">灰度</option>
                            <option value="rotate_90">旋转90度</option>
                        </select>
                    </div>
                </div>
                <div>
                    <button type="submit" disabled={isUploading || !sourceVideo || !materialVideo} className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed">
                        {isUploading ? <SpinnerIcon className="animate-spin h-5 w-5 mr-3" /> : <UploadIcon className="h-5 w-5 mr-2"/>}
                        {isUploading ? '上传处理中...' : '开始处理'}
                    </button>
                </div>
                {message && <p className={`mt-4 text-sm ${message.includes('失败') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
            </form>
        </div>
    );
};

const TaskListSection: React.FC<{ tasks: TaskDetails[]; token: string; refreshTask: (taskId: string) => void;}> = ({ tasks, token, refreshTask }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: keyof TaskDetails; direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });
    const [downloading, setDownloading] = useState<string | null>(null); // Track downloading task ID
    const tasksPerPage = 10;

    const formatDuration = (totalSeconds?: number): string => {
        if (typeof totalSeconds !== 'number' || totalSeconds < 0) return 'N/A';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return [hours, minutes, seconds]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    };

    const formatSize = (bytes?: number): string => {
        if (typeof bytes !== 'number' || bytes < 0) return 'N/A';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const sortedTasks = useMemo(() => {
        let sortableTasks = [...tasks];
        if (sortConfig !== null) {
            sortableTasks.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue === undefined || aValue === null || aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (bValue === undefined || bValue === null || aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableTasks;
    }, [tasks, sortConfig]);
    
    const requestSort = (key: keyof TaskDetails) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const paginatedTasks = sortedTasks.slice((currentPage - 1) * tasksPerPage, currentPage * tasksPerPage);
    const totalPages = Math.ceil(tasks.length / tasksPerPage);

    const getStatusIndicator = (status: TaskStatus) => {
        switch (status) {
            case TaskStatus.COMPLETED:
                return <span className="flex items-center text-green-600"><CheckCircleIcon className="h-5 w-5 mr-2" />已完成</span>;
            case TaskStatus.RUNNING:
                return <span className="flex items-center text-yellow-600"><SpinnerIcon className="h-5 w-5 mr-2 animate-spin" />处理中</span>;
            case TaskStatus.FAILED:
                return <span className="flex items-center text-red-600"><XCircleIcon className="h-5 w-5 mr-2" />失败</span>;
            default:
                return <span className="flex items-center text-gray-500"><ClockIcon className="h-5 w-5 mr-2" />待处理</span>;
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const handleDownload = async (taskId: string) => {
        setDownloading(taskId);
        try {
            const blob = await api.downloadVideo(taskId, token);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${taskId}.mp4`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('下载失败:', error);
            alert('视频下载失败，请查看控制台获取更多信息。');
        } finally {
            setDownloading(null);
        }
    };

    const SortableHeader: React.FC<{sortKey: keyof TaskDetails, label: string}> = ({sortKey, label}) => (
        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort(sortKey)}>
            <div className="flex items-center">
                {label}
                {sortConfig?.key === sortKey && (
                    <span className="ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
            </div>
        </th>
    );

    const renderTaskActions = (task: TaskDetails) => (
        <>
            {task.status === TaskStatus.COMPLETED && (
                <button onClick={() => handleDownload(task.id)} disabled={downloading === task.id} className="text-blue-600 hover:text-blue-900 flex items-center disabled:opacity-50 disabled:cursor-wait">
                    {downloading === task.id ? <SpinnerIcon className="h-5 w-5 mr-1 animate-spin" /> : <DownloadIcon className="h-5 w-5 mr-1" />}
                    {downloading === task.id ? '下载中' : '下载'}
                </button>
            )}
            {task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.FAILED && (
                <button onClick={() => refreshTask(task.id)} className="text-gray-600 hover:text-gray-900 flex items-center">
                    <RefreshIcon className="h-5 w-5 mr-1" />刷新
                </button>
            )}
        </>
    );

    return (
        <div className="bg-white p-4 sm:p-8 rounded-xl shadow-lg mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">任务列表</h2>

             {/* Mobile Card View */}
            <div className="space-y-4 md:hidden">
                {paginatedTasks.length > 0 ? paginatedTasks.map((task) => (
                    <div key={task.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex justify-between items-start">
                            <p className="font-mono text-sm text-gray-800 break-all pr-2">{task.id}</p>
                            <div className="flex-shrink-0 text-sm">{getStatusIndicator(task.status)}</div>
                        </div>
                        <div className="mt-4 border-t border-gray-200 pt-4 text-sm">
                            <dl className="space-y-2">
                                <div className="flex justify-between"><dt className="text-gray-500">创建时间</dt><dd className="text-gray-800 text-right">{formatDate(task.createdAt)}</dd></div>
                                <div className="flex justify-between"><dt className="text-gray-500">完成时间</dt><dd className="text-gray-800 text-right">{formatDate(task.end_time)}</dd></div>
                                <div className="flex justify-between"><dt className="text-gray-500">处理耗时</dt><dd className="text-gray-800">{formatDuration(task.processing_time_seconds)}</dd></div>
                                <div className="flex justify-between"><dt className="text-gray-500">视频时长</dt><dd className="text-gray-800">{formatDuration(task.final_video_duration_seconds)}</dd></div>
                                <div className="flex justify-between"><dt className="text-gray-500">文件大小</dt><dd className="text-gray-800">{formatSize(task.final_video_size_bytes)}</dd></div>
                            </dl>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end space-x-4">
                            {renderTaskActions(task)}
                        </div>
                    </div>
                )) : <p className="text-center py-4 text-gray-500">暂无任务</p>}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
                 {tasks.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <SortableHeader sortKey="id" label="任务ID" />
                                <SortableHeader sortKey="status" label="状态" />
                                <SortableHeader sortKey="createdAt" label="创建时间" />
                                <SortableHeader sortKey="processing_time_seconds" label="处理耗时" />
                                <SortableHeader sortKey="final_video_duration_seconds" label="视频时长" />
                                <SortableHeader sortKey="final_video_size_bytes" label="文件大小" />
                                <SortableHeader sortKey="end_time" label="完成时间" />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {paginatedTasks.map((task) => (
                                <tr key={task.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{task.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{getStatusIndicator(task.status)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(task.createdAt)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDuration(task.processing_time_seconds)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDuration(task.final_video_duration_seconds)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatSize(task.final_video_size_bytes)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(task.end_time)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-4">{renderTaskActions(task)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 ) : <p className="text-center py-4 text-gray-500">暂无任务</p>}
            </div>
            
            {totalPages > 1 && (
                <div className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                        上一页
                    </button>
                    <span className="text-sm text-gray-700">第 {currentPage} 页 / 共 {totalPages} 页</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                        下一页
                    </button>
                </div>
            )}
        </div>
    );
};


const MainPage: React.FC<MainPageProps> = ({ token, onLogout }) => {
  const [tasks, setTasks] = useState<TaskDetails[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchAllTasks = useCallback(async () => {
    try {
      const serverTasks = await api.getTasks(token);
      setTasks(serverTasks);
      setError(null);
    } catch (err: any) {
      console.error("无法从服务器获取任务:", err);
      setError("无法加载任务列表。请检查您的网络连接并稍后重试。");
    }
  }, [token]);

  const refreshSpecificTask = useCallback(async (taskId: string) => {
    try {
        const updatedTask = await api.getTaskStatus(taskId, token);
        setTasks(currentTasks => currentTasks.map(t => t.id === taskId ? updatedTask : t));
    } catch (error) {
        console.error(`刷新任务失败 ${taskId}:`, error);
        // Optionally show a temporary error message to the user for this specific task
    }
  }, [token]);

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  useEffect(() => {
    const tasksToPoll = tasks.filter(
      (task) => task.status === TaskStatus.RUNNING || task.status === TaskStatus.PENDING
    );

    if (tasksToPoll.length === 0) {
      return; 
    }

    const intervalId = setInterval(() => {
      tasksToPoll.forEach((task) => {
        refreshSpecificTask(task.id);
      });
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(intervalId);
  }, [tasks, refreshSpecificTask]);

  const handleTaskCreated = (newTask: StoredTask) => {
      fetchAllTasks();
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">视频处理面板</h1>
          <button
            onClick={onLogout}
            className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            登出
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <UploadSection token={token} onTaskCreated={handleTaskCreated} />
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative my-6" role="alert">{error}</div>}
        <TaskListSection tasks={tasks} token={token} refreshTask={refreshSpecificTask} />
      </main>
    </div>
  );
};

export default MainPage;
