import React, { useState } from 'react';
import LoginPage from './components/LoginPage';
import MainPage from './components/MainPage';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => {
    // 检查本地存储，然后检查会话存储
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  });

  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('authToken');
    setToken(null);
  };

  return token ? (
    <MainPage token={token} onLogout={handleLogout} />
  ) : (
    <LoginPage onLogin={handleLogin} />
  );
};

export default App;
