import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LogIn, Wrench, User as UserIcon, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface LocationState {
  from?: { pathname: string };
}

const LAST_USERNAME_KEY = 'maintenance_last_username';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem(LAST_USERNAME_KEY) || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname || '/';

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState?.('CapsLock') ?? false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('กรุณาระบุชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      localStorage.setItem(LAST_USERNAME_KEY, username.trim());
      if (user.force_password_change) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axiosErr = err as any;
      if (axiosErr?.response) {
        setError(axiosErr.response.data?.error || 'เข้าสู่ระบบไม่สำเร็จ');
      } else {
        setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์กำลังทำงานอยู่ หรือลองรีเฟรชหน้านี้ใหม่');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" style={{
      minHeight: '100vh',
      background: 'var(--bg-app)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background Animated Blobs */}
      <style>{`
        @keyframes float-blob-1 {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(50px, -70px) scale(1.15); }
          66% { transform: translate(-30px, 30px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float-blob-2 {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(-40px, 50px) scale(0.9); }
          66% { transform: translate(60px, -40px) scale(1.1); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes login-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-logo {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.25); }
          50% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
        }
        .login-card-container {
          animation: login-fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bg-blob {
          position: absolute;
          border-radius: 50%;
          /* Was blur(120px) with a 3rd blob: heavy compositing cost (blur
             radius roughly scales quadratically) made this the slowest
             render in the whole app. Dropped to 2 blobs at a lighter blur
             for a similar glow with a fraction of the GPU cost. */
          filter: blur(60px);
          pointer-events: none;
          z-index: 0;
        }
        .bg-blob-1 {
          top: 15%;
          left: 10%;
          width: 320px;
          height: 320px;
          background: var(--primary);
          opacity: 0.14;
          animation: float-blob-1 12s infinite ease-in-out;
        }
        .bg-blob-2 {
          bottom: 10%;
          right: 15%;
          width: 380px;
          height: 380px;
          background: var(--primary);
          opacity: 0.12;
          animation: float-blob-2 15s infinite ease-in-out;
        }
        [data-theme='dark'] .bg-blob-1 {
          background: var(--primary-action);
          opacity: 0.08;
        }
        [data-theme='dark'] .bg-blob-2 {
          background: var(--primary-deep);
          opacity: 0.08;
        }
      `}</style>

      {/* Floating Blobs */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      {/* Main Glassmorphic Form Card */}
      <div 
        className="login-card-container"
        style={{
          width: '100%',
          maxWidth: '430px',
          padding: '2.75rem 2.5rem',
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: '24px',
          boxShadow: 'var(--glass-shadow)',
          zIndex: 1,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--primary-light)',
            marginBottom: '16px',
            animation: 'pulse-logo 2.5s infinite',
            border: '1px solid rgba(37, 99, 235, 0.18)',
          }}>
            <Wrench size={26} color="var(--primary)" />
          </div>
          <h1 style={{ 
            margin: 0, 
            fontSize: '1.45rem', 
            fontWeight: 800, 
            color: 'var(--text-main)',
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-display)'
          }}>
            ระบบซ่อมบำรุงและคลังพัสดุ
          </h1>
          <p style={{ 
            margin: '6px 0 0', 
            fontSize: '0.8rem', 
            color: 'var(--text-muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontFamily: 'var(--font-display)'
          }}>
            Repair & Inventory Management
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '0.82rem',
              fontWeight: 700, 
              marginBottom: '6px', 
              color: 'var(--text-main)',
            }}>
              <UserIcon size={14} color="var(--primary)" /> 
              <span>ชื่อผู้ใช้</span>
            </label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้ของคุณ"
              autoFocus
              autoComplete="username"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '0.82rem',
              fontWeight: 700, 
              marginBottom: '6px', 
              color: 'var(--text-main)',
            }}>
              <Lock size={14} color="var(--primary)" />
              <span>รหัสผ่าน</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={handlePasswordKeyEvent}
                onKeyDown={handlePasswordKeyEvent}
                placeholder="กรอกรหัสผ่านของคุณ"
                autoComplete="current-password"
                style={{ width: '100%', paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                style={{
                  position: 'absolute',
                  right: '0px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  // 44x44 tap target (WCAG 2.5.5); absolute-positioned so it
                  // doesn't shift the field layout. Icon stays visually centered.
                  width: '44px',
                  height: '44px',
                  padding: '0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {capsLockOn && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: 'var(--warning, #d97706)',
              }}>
                <AlertCircle size={12} /> Caps Lock เปิดอยู่
              </span>
            )}
          </div>

          {error && (
            <div style={{
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '8px',
              padding: '10px 14px', 
              background: 'var(--danger-light)',
              border: '1px solid var(--danger-border)', 
              borderRadius: '12px',
              color: 'var(--danger)', 
              fontSize: '0.82rem', 
              fontWeight: 600,
              lineHeight: '1.4',
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> 
              <span>{error}</span>
            </div>
          )}

          <Button 
            type="submit" 
            variant="primary" 
            loading={loading} 
            icon={<LogIn size={16} />} 
            style={{ 
              width: '100%', 
              padding: '12px 24px', 
              borderRadius: '14px',
              fontSize: '0.95rem',
              marginTop: '0.5rem',
            }}
          >
            เข้าสู่ระบบ
          </Button>
        </form>

        <div style={{
          marginTop: '2rem', 
          paddingTop: '1.25rem', 
          borderTop: '1px solid var(--border)',
          fontSize: '0.72rem', 
          color: 'var(--text-muted)', 
          textAlign: 'center',
          fontWeight: 500,
        }}>
          ใช้สำหรับบุคลากรภายในองค์กรเท่านั้น | ลืมรหัสผ่านติดต่อแอดมิน
        </div>
      </div>
    </div>
  );
};

export default Login;
