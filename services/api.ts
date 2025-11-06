import { TaskDetails } from '../types';

export const api = {
  login: async (username: string, password: string, rememberMe: boolean): Promise<{ access_token: string }> => {
    try {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const url = rememberMe ? '/token?remember_me=true' : '/token';

      const response = await fetch(url, {
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
    token: string,
    min_duration: number,
    max_duration: number,
    slowdown_factor: number | null,
    effect: string,
    onProgress?: (progress: { loaded: number; total: number; file: string }) => void
  ): Promise<{ task_id: string }> => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    const totalSize = sourceVideo.size + materialVideo.size;
    let totalBytesUploaded = 0;

    const uploadFileInChunks = async (file: File, fileType: string, taskId: string) => {
      onProgress?.({ loaded: totalBytesUploaded, total: totalSize, file: file.name });

      const startResponse = await fetch("/upload/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Bearer ${token}`,
        },
        body: new URLSearchParams({ filename: file.name }),
      });

      if (!startResponse.ok) {
        const errorText = await startResponse.text().catch(() => `HTTP ${startResponse.status}: ${startResponse.statusText}`);
        throw new Error(`无法启动上传 (${file.name}): ${errorText}`);
      }

      let upload_id;
      try {
        const data = await startResponse.json();
        upload_id = data.upload_id;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error('任务创建失败：服务器在启动上传时返回了无效的响应（可能是HTML页面），而不是预期的JSON数据。这可能是由于会话过期或服务器配置错误。请尝试重新登录。');
        }
        throw error; // Re-throw other parsing errors
      }

      let chunkNumber = 0;
      for (let start = 0; start < file.size; start += CHUNK_SIZE) {
        const chunk = file.slice(start, start + CHUNK_SIZE);
        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("upload_id", upload_id);
        formData.append("chunk_number", chunkNumber.toString());

        const chunkResponse = await fetch("/upload/chunk", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
          body: formData,
        });

        if (!chunkResponse.ok) {
          const errorText = await chunkResponse.text().catch(() => `HTTP ${chunkResponse.status}: ${chunkResponse.statusText}`);
          throw new Error(`块上传失败: ${file.name}, 块 #${chunkNumber}. 详情: ${errorText}`);
        }
        totalBytesUploaded += chunk.size;
        onProgress?.({ loaded: totalBytesUploaded, total: totalSize, file: file.name });
        chunkNumber++;
      }

      const completeFormData = new FormData();
      completeFormData.append("upload_id", upload_id);
      completeFormData.append("filename", file.name);
      completeFormData.append("file_type", fileType);
      completeFormData.append("task_id", taskId);
      completeFormData.append("min_duration", min_duration.toString());
      completeFormData.append("max_duration", max_duration.toString());
      if (slowdown_factor) {
        completeFormData.append("slowdown_factor", slowdown_factor.toString());
      }
      completeFormData.append("effect", effect);

      const completeResponse = await fetch("/upload/complete", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: completeFormData,
      });

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text().catch(() => `HTTP ${completeResponse.status}: ${completeResponse.statusText}`);
        throw new Error(`无法完成上传: ${file.name}. 详情: ${errorText}`);
      }
    };

    const taskId = `${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 14)}_${Math.random().toString(36).substring(2, 6)}`;

    await uploadFileInChunks(sourceVideo, "source", taskId);
    // Ensure progress hits 100% for the first file before starting the second if sizes are weird
    totalBytesUploaded = sourceVideo.size;
    await uploadFileInChunks(materialVideo, "material", taskId);
    
    onProgress?.({ loaded: totalSize, total: totalSize, file: materialVideo.name });

    return { task_id: taskId };
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
      
      if (data && Array.isArray(data.tasks)) {
        return data.tasks;
      }

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

  deleteTask: async (taskId: string, token: string): Promise<{ message: string }> => {
    const response = await fetch(`/tasks/${taskId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.detail || `删除任务失败: ${response.statusText}`);
    }
    return response.json();
  },

  downloadVideo: async (taskId: string, token: string, onProgress?: (progress: { loaded: number, total: number }) => void): Promise<Blob> => {
    const response = await fetch(`/download-video/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`视频下载失败: ${response.statusText}`);
    }

    if (!response.body) {
        throw new Error("响应体为空，无法下载文件。");
    }

    const contentLength = response.headers.get('Content-Length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();

    while(true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        receivedLength += value.length;
        if (totalSize > 0) {
            onProgress?.({ loaded: receivedLength, total: totalSize });
        }
    }

    return new Blob(chunks);
  },
};