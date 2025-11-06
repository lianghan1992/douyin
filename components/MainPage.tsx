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
            const response = await api.createTask(sourceVideo, materialVideo, token);
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
        <div className="bg-white p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">创建新任务</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                    <FileInput id="source-video" label="源视频" file={sourceVideo} onChange={e => handleFileChange(e, 'source')} />
                    <FileInput id="material-video" label="素材视频" file={materialVideo} onChange={e => handleFileChange(e, 'material')} />
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
        return new Date(dateString).toLocaleString('zh-CN');
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

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">任务列表</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <SortableHeader sortKey="id" label="任务ID" />
                            <SortableHeader sortKey="status" label="状态" />
                            <SortableHeader sortKey="createdAt" label="创建时间" />
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(task.end_time)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {tasks.length === 0 && <p className="text-center py-4 text-gray-500">暂无任务</p>}
            </div>
            {totalPages > 1 && (
                <div className="py-4 flex items-center justify-between">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                        上一页
                    </button>
                    <span className="text-sm text-gray-700">第 {currentPage} 页 / 共 {totalPages} 页</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
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
      const newTaskDetails: TaskDetails = {
          id: newTask.id,
          createdAt: newTask.createdAt,
          status: TaskStatus.PENDING,
      };
      setTasks(currentTasks => [newTaskDetails, ...currentTasks]);
      setTimeout(() => fetchAllTasks(), 2000); // Refresh the whole list to get server-side details
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">视频处理面板</h1>
          <button
            onClick={onLogout}
            className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            登出
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <UploadSection token={token} onTaskCreated={handleTaskCreated} />
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative my-6" role="alert">{error}</div>}
        <TaskListSection tasks={tasks} token={token} refreshTask={refreshSpecificTask} />
      </main>
    </div>
  );
};

export default MainPage;
