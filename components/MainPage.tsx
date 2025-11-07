import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { TaskDetails, TaskStatus, StoredTask } from '../types';
import { UploadIcon, SpinnerIcon, DownloadIcon, RefreshIcon, CheckCircleIcon, XCircleIcon, ClockIcon, ChevronDownIcon, VideoIcon, XIcon, TrashIcon } from './icons';

// --- Types for Batch Upload ---
type FileStatus = 'waiting' | 'hashing' | 'checking' | 'needs_upload' | 'uploading' | 'uploaded' | 'server_exists' | 'error';
interface FileState {
    file: File | null;
    hash: string | null;
    status: FileStatus;
    progress: number;
    error: string | null;
}
interface BatchTask {
    id: string; // client-side unique ID
    source: FileState;
    material: FileState;
    min_duration: number; // Stored in minutes
    max_duration: number; // Stored in minutes
    slowdown_factor: number | null;
    effect: string;
}

// --- Helper Functions ---
const createDefaultFileState = (): FileState => ({
    file: null, hash: null, status: 'waiting', progress: 0, error: null
});

const generateUserFriendlyId = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const randomSuffix = Math.floor(Math.random() * 9000) + 1000; // 4-digit random number

    return `${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;
};

const createDefaultBatchTask = (): BatchTask => ({
    id: generateUserFriendlyId(),
    source: createDefaultFileState(),
    material: createDefaultFileState(),
    min_duration: 60, // Default: 60 minutes
    max_duration: 70, // Default: 70 minutes
    slowdown_factor: null,
    effect: 'vflip',
});

const calculateSHA256 = async (file: File, onProgress: (percent: number) => void): Promise<string> => {
    // Note: file.arrayBuffer() reads the entire file into memory.
    // This can be an issue for extremely large files in memory-constrained environments.
    // For robust, production-grade applications, a streaming approach with a library might be preferable.
    onProgress(0);
    const buffer = await file.arrayBuffer();
    onProgress(50);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    onProgress(100);
    return hashHex;
};

const formatSpeed = (bytesPerSecond: number): string => {
    if (!isFinite(bytesPerSecond) || bytesPerSecond < 0) return '0 B/s';
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const ProgressBar: React.FC<{ percentage: number }> = ({ percentage }) => (
    <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
            className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out" 
            style={{ width: `${percentage}%` }}
        ></div>
    </div>
);

// --- New Batch Upload Component ---
const UploadSection: React.FC<{ token: string; onBatchSubmitted: () => void; }> = ({ token, onBatchSubmitted }) => {
    const [batchTasks, setBatchTasks] = useState<BatchTask[]>([createDefaultBatchTask()]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [submissionStatus, setSubmissionStatus] = useState('');

    const updateTask = (taskId: string, newValues: Partial<BatchTask>) => {
        setBatchTasks(currentTasks => 
            currentTasks.map(task => task.id === taskId ? { ...task, ...newValues } : task)
        );
    };

    const updateFileState = (taskId: string, fileType: 'source' | 'material', newFileState: Partial<FileState>) => {
        setBatchTasks(currentTasks =>
            currentTasks.map(task => {
                if (task.id === taskId) {
                    return { ...task, [fileType]: { ...task[fileType], ...newFileState } };
                }
                return task;
            })
        );
    };
    
    const handleFileChange = async (taskId: string, fileType: 'source' | 'material', file: File | null) => {
        if (!file) {
            updateTask(taskId, { [fileType]: createDefaultFileState() });
            return;
        }

        updateFileState(taskId, fileType, { file, status: 'hashing', progress: 0, error: null });
        try {
            const hash = await calculateSHA256(file, (p) => updateFileState(taskId, fileType, { progress: p }));
            updateFileState(taskId, fileType, { hash, status: 'checking' });
            
            const { exists } = await api.checkVideoExistence(hash, token);
            updateFileState(taskId, fileType, { status: exists ? 'server_exists' : 'needs_upload' });
        } catch (err: any) {
            console.error('File processing error:', err);
            updateFileState(taskId, fileType, { status: 'error', error: err.message || '文件处理失败' });
        }
    };

    const handleAddTask = () => {
        setBatchTasks(current => [...current, createDefaultBatchTask()]);
    };

    const handleRemoveTask = (taskId: string) => {
        setBatchTasks(current => current.filter(task => task.id !== taskId));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setGlobalError(null);
        setSubmissionStatus('准备上传...');

        try {
            // 1. Collect all unique files that need uploading
            const filesToUpload = new Map<string, { file: File, tasks: {taskId: string, type: 'source' | 'material'}[] }>();
            batchTasks.forEach(task => {
                (['source', 'material'] as const).forEach(type => {
                    const fileState = task[type];
                    if (fileState.status === 'needs_upload' && fileState.file && fileState.hash) {
                        if (!filesToUpload.has(fileState.hash)) {
                            filesToUpload.set(fileState.hash, { file: fileState.file, tasks: [] });
                        }
                        filesToUpload.get(fileState.hash)!.tasks.push({ taskId: task.id, type });
                    }
                });
            });

            // 2. Upload files
            let uploadedCount = 0;
            const totalToUpload = filesToUpload.size;
            for (const [hash, { file, tasks }] of filesToUpload.entries()) {
                uploadedCount++;
                setSubmissionStatus(`正在上传文件 ${uploadedCount} / ${totalToUpload}: ${file.name}`);
                
                // Mark all tasks using this file as 'uploading'
                tasks.forEach(({ taskId, type }) => updateFileState(taskId, type, { status: 'uploading', progress: 0 }));

                try {
                    await api.uploadFileInChunks(file, token, (progress) => {
                        tasks.forEach(({ taskId, type }) => updateFileState(taskId, type, { progress: (progress.loaded / progress.total) * 100 }));
                    });
                     // Mark all tasks using this file as 'uploaded'
                    tasks.forEach(({ taskId, type }) => updateFileState(taskId, type, { status: 'uploaded' }));
                } catch(uploadError: any) {
                    tasks.forEach(({ taskId, type }) => updateFileState(taskId, type, { status: 'error', error: `上传失败: ${uploadError.message}` }));
                    throw new Error(`文件 ${file.name} 上传失败。`); // Stop batch process
                }
            }
            
            // 3. Construct and submit batch task creation request
            setSubmissionStatus('所有文件准备就绪，正在创建任务...');
            const tasksPayload = batchTasks.map(task => {
                if (!task.source.hash || !task.material.hash) {
                    throw new Error(`任务 ${task.id} 的文件信息不完整。`);
                }
                if (task.source.status === 'error' || task.material.status === 'error'){
                     throw new Error(`任务 ${task.id} 包含错误的文件，无法提交。`);
                }
                return {
                    source_hash: task.source.hash,
                    material_hash: task.material.hash,
                    task_id: task.id, // client-generated, for tracking
                    min_duration: task.min_duration * 60, // Convert minutes to seconds
                    max_duration: task.max_duration * 60, // Convert minutes to seconds
                    slowdown_factor: task.slowdown_factor,
                    effect: task.effect
                };
            });

            await api.createTasksBatch(tasksPayload, token);
            setSubmissionStatus('批量任务已成功提交！');
            setTimeout(() => {
                setBatchTasks([createDefaultBatchTask()]);
                onBatchSubmitted();
                setSubmissionStatus('');
            }, 3000);

        } catch (err: any) {
            console.error("Batch submission error:", err);
            setGlobalError(err.message || "批量提交失败，请检查文件并重试。");
            setSubmissionStatus('');
        } finally {
            setIsSubmitting(false);
        }
    };

    const canSubmit = batchTasks.length > 0 && batchTasks.every(task =>
        task.source.file && task.material.file &&
        !['waiting', 'hashing', 'checking', 'uploading'].includes(task.source.status) &&
        !['waiting', 'hashing', 'checking', 'uploading'].includes(task.material.status) &&
        task.source.status !== 'error' && task.material.status !== 'error'
    );
    
    return (
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">创建新任务 (批量模式)</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                {batchTasks.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                        <p className="text-gray-500">点击 "添加任务" 开始创建您的第一个任务。</p>
                    </div>
                )}
                <div className="space-y-6">
                    {batchTasks.map((task, index) => (
                        <BatchTaskRow
                            key={task.id}
                            task={task}
                            onUpdate={updateTask}
                            onFileChange={handleFileChange}
                            onRemove={handleRemoveTask}
                            isSubmitting={isSubmitting}
                        />
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={handleAddTask} disabled={isSubmitting} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
                        添加任务
                    </button>
                    <button type="submit" disabled={isSubmitting || !canSubmit} className="inline-flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors duration-200">
                        {isSubmitting ? <SpinnerIcon className="animate-spin h-5 w-5 mr-2" /> : <UploadIcon className="h-5 w-5 mr-2"/>}
                        {isSubmitting ? submissionStatus : `提交 ${batchTasks.length} 个任务`}
                    </button>
                </div>
                {globalError && <p className="text-sm text-red-600 text-center">{globalError}</p>}
                {submissionStatus && !isSubmitting && <p className="text-sm text-green-600 text-center">{submissionStatus}</p>}
            </form>
        </div>
    );
};

const BatchTaskRow: React.FC<{
    task: BatchTask,
    onUpdate: (taskId: string, newValues: Partial<BatchTask>) => void,
    onFileChange: (taskId: string, fileType: 'source' | 'material', file: File | null) => void,
    onRemove: (taskId: string) => void,
    isSubmitting: boolean,
}> = ({ task, onUpdate, onFileChange, onRemove, isSubmitting }) => {
    const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);

    return (
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-700">任务 #{task.id.substring(task.id.length - 4)}</h3>
                <button type="button" onClick={() => onRemove(task.id)} disabled={isSubmitting} title="删除此任务" className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-100 disabled:opacity-50">
                    <TrashIcon className="h-5 w-5"/>
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FileProcessor id={`source-${task.id}`} label="源视频" fileState={task.source} onFileChange={(f) => onFileChange(task.id, 'source', f)} isSubmitting={isSubmitting}/>
                <FileProcessor id={`material-${task.id}`} label="素材视频" fileState={task.material} onFileChange={(f) => onFileChange(task.id, 'material', f)} isSubmitting={isSubmitting}/>
            </div>
            
            <div className="border-t border-gray-200 pt-4 mt-6">
                <button type="button" onClick={() => setAdvancedOptionsOpen(!advancedOptionsOpen)} className="flex justify-between items-center w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none">
                    <span>高级处理选项</span>
                    <ChevronDownIcon className={`h-5 w-5 transform transition-transform text-gray-500 ${advancedOptionsOpen ? 'rotate-180' : ''}`} />
                </button>
                {advancedOptionsOpen && (
                    <div className="mt-4 flex flex-col md:flex-row md:items-end gap-4">
                        <div className="flex-1 min-w-[120px]">
                            <label htmlFor={`min_duration-${task.id}`} className="block text-sm font-medium text-gray-700">最小持续时间 (分钟)</label>
                            <input type="number" name="min_duration" id={`min_duration-${task.id}`} value={task.min_duration} onChange={e => onUpdate(task.id, { min_duration: parseInt(e.target.value) || 0 })} disabled={isSubmitting} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                            <label htmlFor={`max_duration-${task.id}`} className="block text-sm font-medium text-gray-700">最大持续时间 (分钟)</label>
                            <input type="number" name="max_duration" id={`max_duration-${task.id}`} value={task.max_duration} onChange={e => onUpdate(task.id, { max_duration: parseInt(e.target.value) || 0 })} disabled={isSubmitting} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                            <label htmlFor={`effect-${task.id}`} className="block text-sm font-medium text-gray-700">效果</label>
                            <select id={`effect-${task.id}`} name="effect" value={task.effect} onChange={e => onUpdate(task.id, { effect: e.target.value })} disabled={isSubmitting} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                                <option value="vflip">垂直翻转</option>
                                <option value="hflip">水平翻转</option>
                                <option value="grayscale">灰度</option>
                                <option value="rotate_90">旋转90度</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const FileProcessor: React.FC<{
    id: string;
    label: string;
    fileState: FileState;
    onFileChange: (file: File | null) => void;
    isSubmitting: boolean;
}> = ({ id, label, fileState, onFileChange, isSubmitting }) => {
    const { file, status, progress, error } = fileState;

    const StatusDisplay = () => {
        switch(status) {
            case 'hashing':
            case 'checking':
            case 'uploading':
                const statusText = {hashing: '正在计算哈希...', checking: '正在校验文件...', uploading: '正在上传...'}[status];
                return (
                    <div className="w-full text-center">
                        <SpinnerIcon className="mx-auto h-8 w-8 text-indigo-500 animate-spin"/>
                        <p className="mt-2 text-sm text-gray-800 font-medium">{statusText}</p>
                        {(status === 'hashing' || status === 'uploading') && <ProgressBar percentage={progress} />}
                    </div>
                );
            case 'server_exists':
                return (
                     <div className="text-center">
                        <CheckCircleIcon className="mx-auto h-8 w-8 text-green-500"/>
                        <p className="mt-2 text-sm text-gray-800 font-medium truncate max-w-xs" title={file!.name}>{file!.name}</p>
                        <p className="text-xs text-green-600 font-semibold">秒传就绪 (文件已存在)</p>
                    </div>
                );
            case 'needs_upload':
            case 'uploaded':
                 return (
                     <div className="text-center">
                        <CheckCircleIcon className="mx-auto h-8 w-8 text-blue-500"/>
                        <p className="mt-2 text-sm text-gray-800 font-medium truncate max-w-xs" title={file!.name}>{file!.name}</p>
                        <p className="text-xs text-blue-600 font-semibold">{status === 'uploaded' ? '上传完成' : '待上传'}</p>
                    </div>
                );
            case 'error':
                 return (
                     <div className="text-center">
                        <XCircleIcon className="mx-auto h-8 w-8 text-red-500"/>
                        <p className="mt-2 text-sm text-red-700 font-medium truncate max-w-xs" title={error!}>{error}</p>
                    </div>
                 );
            default: // 'waiting'
                return (
                    <div className="space-y-1 text-center">
                        <VideoIcon className="mx-auto h-8 w-8 text-gray-400"/>
                        <div className="flex text-sm text-gray-600">
                            <label htmlFor={id} className="relative cursor-pointer bg-transparent rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                            <span>点击上传</span>
                            <input id={id} name={id} type="file" accept="video/*" className="sr-only" onChange={e => onFileChange(e.target.files?.[0] || null)} disabled={isSubmitting}/>
                            </label>
                            <p className="pl-1">或拖拽文件</p>
                        </div>
                        <p className="text-xs text-gray-500">支持 MP4, MOV 等</p>
                    </div>
                );
        }
    };

    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="mt-1 relative flex justify-center items-center p-4 border-2 border-gray-300 border-dashed rounded-md transition-colors duration-200 ease-in-out hover:border-indigo-400 bg-white min-h-[120px]">
                <StatusDisplay />
                {file && !isSubmitting && (
                    <button type="button" onClick={() => onFileChange(null)} className="absolute top-2 right-2 p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <XIcon className="h-4 w-4"/>
                    </button>
                )}
            </div>
        </div>
    );
}

const TaskListSection: React.FC<{ 
    tasks: TaskDetails[]; 
    token: string; 
    refreshTask: (taskId: string) => void;
    onTaskDeleted: (taskId: string) => void;
}> = ({ tasks, token, refreshTask, onTaskDeleted }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: keyof TaskDetails; direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });
    const [downloadProgress, setDownloadProgress] = useState<{ [taskId: string]: number }>({});
    const [downloadStats, setDownloadStats] = useState<{ [taskId: string]: { speed: number, lastTime: number, lastLoaded: number } }>({});
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
        setDownloadProgress(prev => ({ ...prev, [taskId]: 0 }));
        setDownloadStats(prev => ({ ...prev, [taskId]: { speed: 0, lastTime: Date.now(), lastLoaded: 0 } }));
        try {
            const blob = await api.downloadVideo(taskId, token, (progress) => {
                const { loaded, total } = progress;
                const percentage = total > 0 ? (loaded / total) * 100 : 0;
                setDownloadProgress(prev => ({ ...prev, [taskId]: percentage }));
                
                setDownloadStats(prev => {
                    const stats = prev[taskId];
                    if (!stats) return prev; // Guard against race condition
                    const now = Date.now();
                    const timeDiff = (now - stats.lastTime) / 1000;
            
                    if (timeDiff > 0.5 || loaded === total) {
                        const bytesDiff = loaded - stats.lastLoaded;
                        const speed = bytesDiff / timeDiff;
                        return { ...prev, [taskId]: { speed: speed > 0 ? speed : 0, lastTime: now, lastLoaded: loaded } };
                    }
                    return prev;
                });
            });
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
            setDownloadProgress(prev => {
                const newState = { ...prev };
                delete newState[taskId];
                return newState;
            });
             setDownloadStats(prev => {
                const newState = { ...prev };
                delete newState[taskId];
                return newState;
            });
        }
    };

    const handleDelete = async (taskId: string) => {
        if (window.confirm(`您确定要删除任务 ${taskId} 吗？此操作不可逆，将删除所有相关文件。`)) {
            try {
                await api.deleteTask(taskId, token);
                onTaskDeleted(taskId);
            } catch (error: any) {
                console.error('删除任务失败:', error);
                alert(`删除任务失败: ${error.message}`);
            }
        }
    };

    const SortableHeader: React.FC<{sortKey: keyof TaskDetails, label: string}> = ({sortKey, label}) => (
        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort(sortKey)}>
            <div className="flex items-center">
                {label}
                {sortConfig?.key === sortKey && (
                    <span className="ml-1 text-gray-400">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
            </div>
        </th>
    );

    const renderTaskActions = (task: TaskDetails) => {
        const isDownloading = downloadProgress[task.id] !== undefined;

        return (
             <div className="flex items-center justify-end gap-2">
                {task.status === TaskStatus.COMPLETED && (
                    isDownloading ? (
                        <div className="w-32 text-center">
                           <div className="flex justify-between text-xs font-medium text-gray-600 px-1">
                               <span>{downloadStats[task.id] ? formatSpeed(downloadStats[task.id].speed) : '...'}</span>
                               <span>{Math.round(downloadProgress[task.id])}%</span>
                            </div>
                            <ProgressBar percentage={downloadProgress[task.id]} />
                        </div>
                    ) : (
                        <button onClick={() => handleDownload(task.id)} title="下载" className="p-2 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors">
                            <DownloadIcon className="h-5 w-5" />
                        </button>
                    )
                )}
                {task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.FAILED && (
                     <button onClick={() => refreshTask(task.id)} title="刷新状态" className="p-2 text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                        <RefreshIcon className="h-5 w-5" />
                    </button>
                )}
                 <button onClick={() => handleDelete(task.id)} title="删除任务" className="p-2 text-red-600 rounded-full hover:bg-red-100 transition-colors">
                    <TrashIcon className="h-5 w-5" />
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white p-4 sm:p-8 rounded-xl shadow-lg mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">任务列表</h2>

            <div className="md:hidden space-y-4">
                {paginatedTasks.length > 0 ? paginatedTasks.map((task) => (
                    <div key={task.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex justify-between items-start">
                            <p className="font-mono text-sm text-gray-800 break-all pr-2">{task.id}</p>
                            <div className="flex-shrink-0 text-sm">{getStatusIndicator(task.status)}</div>
                        </div>
                        <div className="mt-4 border-t border-gray-200 pt-4 text-sm">
                            <dl className="space-y-2">
                                <div className="flex justify-between"><dt className="text-gray-500">创建时间</dt><dd className="text-gray-800 text-right">{formatDate(task.createdAt)}</dd></div>
                                <div className="flex justify-between"><dt className="text-gray-500">处理耗时</dt><dd className="text-gray-800">{formatDuration(task.processing_time_seconds)}</dd></div>
                                <div className="flex justify-between"><dt className="text-gray-500">视频时长</dt><dd className="text-gray-800">{formatDuration(task.final_video_duration_seconds)}</dd></div>
                                <div className="flex justify-between"><dt className="text-gray-500">文件大小</dt><dd className="text-gray-800">{formatSize(task.final_video_size_bytes)}</dd></div>
                            </dl>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                            {renderTaskActions(task)}
                        </div>
                    </div>
                )) : <p className="text-center py-4 text-gray-500">暂无任务</p>}
            </div>

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
                                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {paginatedTasks.map((task) => (
                                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{task.id}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">{getStatusIndicator(task.status)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(task.createdAt)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDuration(task.processing_time_seconds)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDuration(task.final_video_duration_seconds)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatSize(task.final_video_size_bytes)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {renderTaskActions(task)}
                                    </td>
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


// FIX: Added missing MainPageProps interface definition.
interface MainPageProps {
  token: string;
  onLogout: () => void;
}

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

  const handleBatchSubmitted = () => {
      fetchAllTasks();
  };

  const handleTaskDeleted = (taskId: string) => {
    setTasks(currentTasks => currentTasks.filter(task => task.id !== taskId));
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
        <UploadSection token={token} onBatchSubmitted={handleBatchSubmitted} />
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative my-6" role="alert">{error}</div>}
        <TaskListSection tasks={tasks} token={token} refreshTask={refreshSpecificTask} onTaskDeleted={handleTaskDeleted} />
      </main>
    </div>
  );
};

export default MainPage;