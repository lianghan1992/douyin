import { TaskDetails, TaskStatus } from '../types';

const BASE_URL = ''; // Relative path because of proxy

export const api = {
  login: async (username: string, password: string): Promise<{ access_token: string }> => {
    // Per requirement: allow empty login without validation for now.
    if (username.trim() === '' && password.trim() === '') {
      return Promise.resolve({ access_token: 'fake-token-for-dev' });
    }

    try {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const response = await fetch(`${BASE_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
        throw new Error(errorData.detail || '登录失败，请检查您的凭据。');
      }
      return await response.json();
    } catch (error) {
      console.error('登录请求时发生错误:', error);
      if (error instanceof SyntaxError) {
          throw new Error('从服务器收到意外的响应。这通常是服务器配置问题，请检查代理设置。');
      }
      // Re-throw other errors, or the custom error from the !response.ok block
      throw error;
    }
  },

  createTask: async (
    sourceVideo: File,
    materialVideo: File,
    token: string
  ): Promise<{ task_id: string }> => {
    try {
      const formData = new FormData();
      formData.append('source_video', sourceVideo);
      formData.append('material_video', materialVideo);

      const response = await fetch(`${BASE_URL}/process-videos/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('创建任务失败:', response.statusText, errorText);
        throw new Error(`创建任务失败: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('创建任务请求时发生错误:', error);
      throw error;
    }
  },

  getTaskStatus: async (taskId: string, token: string): Promise<Partial<TaskDetails>> => {
    try {
      const response = await fetch(`${BASE_URL}/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.error(`获取任务 ${taskId} 状态失败:`, response.statusText);
        return { status: TaskStatus.FAILED, error: `HTTP error: ${response.statusText}` };
      }
      const data = await response.json();
      return { status: data.status, ...data };
    } catch (error) {
      console.error(`获取任务 ${taskId} 状态时发生错误:`, error);
      return { status: TaskStatus.FAILED, error: '网络请求失败' };
    }
  },

  downloadVideo: async (taskId: string, token: string): Promise<Blob> => {
    const response = await fetch(`${BASE_URL}/download-video/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`视频下载失败: ${response.statusText}`);
    }
    return response.blob();
  },
};
