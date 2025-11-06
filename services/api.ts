import { TaskDetails, TaskStatus } from '../types';

export const api = {
  login: async (username: string, password: string): Promise<{ access_token: string }> => {
    try {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const response = await fetch('/token', {
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
          throw new Error('登录失败：服务器返回了意外的HTML页面，而不是预期的JSON数据。这是一个严重的服务器配置错误。请联系您的系统管理员，并请他们检查Apache的代理模块(mod_proxy, mod_proxy_http)、防火墙规则以及SELinux/AppArmor安全策略，这些都可能阻止Apache连接到后端服务。');
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

      const response = await fetch('/process-videos/', {
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

  getTasks: async (token: string): Promise<TaskDetails[]> => {
    try {
      const response = await fetch('/tasks/', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`获取任务列表失败: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Handle the case where the API returns an object like { statistics: {}, tasks: [] }
      if (data && Array.isArray(data.tasks)) {
        return data.tasks;
      }

      // Fallback for when the API returns a direct array
      if (Array.isArray(data)) {
        return data;
      }

      console.error("API /tasks/ did not return a valid task list format:", data);
      throw new Error("服务器返回的数据格式不正确。");
    } catch (error) {
      console.error('获取任务列表时发生错误:', error);
      throw error;
    }
  },

  getTaskStatus: async (taskId: string, token: string): Promise<TaskDetails> => {
    try {
      const response = await fetch(`/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`获取任务 ${taskId} 状态失败:`, response.statusText, errorText);
        throw new Error(`获取任务状态失败: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`获取任务 ${taskId} 状态时发生错误:`, error);
      throw error;
    }
  },

  downloadVideo: async (taskId: string, token: string): Promise<Blob> => {
    const response = await fetch(`/download-video/${taskId}`, {
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