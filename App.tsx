
import React, { useState, useEffect, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import MainPage from './components/MainPage';
import { api } from './services/api';
import { SpinnerIcon } from './components/icons';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('credentials');
    setToken(null);
  };

  const autoLogin = useCallback(async () => {
    const storedCredentials = localStorage.getItem('credentials');
    if (storedCredentials) {
      try {
        const { username, password, saveUntil } = JSON.parse(storedCredentials);
        if (new Date().getTime() < saveUntil) {
          const loginResponse = await api.login(username, password);
          if (loginResponse?.access_token) {
            setToken(loginResponse.access_token);
          } else {
            localStorage.removeItem('credentials');
          }
        } else {
          localStorage.removeItem('credentials');
        }
      } catch (error) {
        console.error('自动登录失败', error);
        localStorage.removeItem('credentials');
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    autoLogin();
  }, [autoLogin]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <SpinnerIcon className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  return token ? (
    <MainPage token={token} onLogout={handleLogout} />
  ) : (
    <LoginPage onLogin={handleLogin} />
  );
};

export default App;
