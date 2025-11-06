
import { TaskDetails, TaskStatus } from '../types';

const BASE_URL = ''; // Relative path because of proxy

export const api = {
  login: async (username: string, password: string): Promise<{ access_token: string } | null> => {
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
        // Allow empty login for now as per requirement
        if (username === '' && password === '') {
          return { access_token: 'fake-token-for-dev' };
        }
        console.error('登录失败:', response.statusText);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('登录请求时发生错误:', error);
      // Allow empty login for now as per requirement
      if (username === '' && password === '') {
        return { access_token: 'fake-token-for-dev' };
      }
      return null;
    }
  },

  createTask: async (
    sourceVideo: File,
    materialVideo: File,
    token: string
  ): Promise<{ task_id: string } | null> => {
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
        console.error('创建任务失败:', response.statusText);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('创建任务请求时发生错误:', error);
      return null;
    }
  },

  getTaskStatus: async (taskId: string, token: string): Promise<Partial<TaskDetails> | null> => {
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

  getDownloadUrl: (taskId: string, token: string): string => {
    return `${BASE_URL}/download-video/${taskId}?token=${token}`;
  },
};
