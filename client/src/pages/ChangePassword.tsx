import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, tokenStorage } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Input } from '../components/ui/Input';
import { KeyRound, Lock, Check, AlertCircle } from 'lucide-react';

const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isFirstLogin = user?.force_password_change;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    setLoading(true);
    try {
      const { token } = await authApi.changePassword(currentPassword, newPassword);
      tokenStorage.set(token);
      await refreshUser();
      navigate('/', { replace: true });
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (err as any)?.response?.data?.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
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
        @keyframes float-blob-3 {
          0% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(30px, 30px) scale(1.05); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes login-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-logo {
          0%, 100% { box-shadow: 0 0 0 0 rgba(41, 182, 246, 0.25); }
          50% { box-shadow: 0 0 0 10px rgba(41, 182, 246, 0); }
        }
        .login-card-container {
          animation: login-fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bg-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          z-index: 0;
        }
        .bg-blob-1 {
          top: 15%;
          left: 10%;
          width: 320px;
          height: 320px;
          background: #29b6f6;
          opacity: 0.14;
          animation: float-blob-1 12s infinite ease-in-out;
        }
        .bg-blob-2 {
          bottom: 10%;
          right: 15%;
          width: 380px;
          height: 380px;
          background: #0ea5e9;
          opacity: 0.12;
          animation: float-blob-2 15s infinite ease-in-out;
        }
        .bg-blob-3 {
          bottom: 25%;
          left: 35%;
          width: 280px;
          height: 280px;
          background: #3b82f6;
          opacity: 0.08;
          animation: float-blob-3 10s infinite ease-in-out;
        }
        [data-theme='dark'] .bg-blob-1 {
          background: #0284c7;
          opacity: 0.08;
        }
        [data-theme='dark'] .bg-blob-2 {
          background: #0369a1;
          opacity: 0.08;
        }
        [data-theme='dark'] .bg-blob-3 {
          background: #1e3a8a;
          opacity: 0.05;
        }
      `}</style>

      {/* Floating Blobs */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="bg-blob bg-blob-3" />

      {/* Main Glassmorphic Form Card */}
      <div 
        className="login-card-container"
        style={{
          width: '100%',
          maxWidth: '440px',
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
        {!isFirstLogin && <BackButton style={{ marginBottom: '1rem' }} />}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
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
            border: '1px solid rgba(41, 182, 246, 0.15)',
          }}>
            <KeyRound size={26} color="var(--primary)" />
          </div>
          <h2 style={{ 
            margin: 0, 
            fontSize: '1.45rem', 
            fontWeight: 800,
            color: 'var(--text-main)',
            letterSpacing: '-0.02em',
            fontFamily: '"Outfit", "Sarabun", sans-serif'
          }}>
            {isFirstLogin ? 'กรุณาตั้งรหัสผ่านใหม่' : 'เปลี่ยนรหัสผ่าน'}
          </h2>
          {isFirstLogin && (
            <p style={{ 
              margin: '6px 0 0', 
              fontSize: '0.82rem', 
              color: 'var(--text-muted)',
              fontWeight: 500,
              fontFamily: '"Outfit", "Sarabun", sans-serif'
            }}>
              นี่คือการเข้าสู่ระบบครั้งแรก กรุณาเปลี่ยนรหัสผ่านเริ่มต้น
            </p>
          )}
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
              color: 'var(--text-main)' 
            }}>
              <Lock size={14} color="var(--primary)" /> 
              <span>รหัสผ่านปัจจุบัน</span>
            </label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="กรอกรหัสผ่านปัจจุบัน"
              autoComplete="current-password"
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
              color: 'var(--text-main)' 
            }}>
              <Lock size={14} color="var(--primary)" /> 
              <span>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</span>
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="กรอกรหัสผ่านใหม่"
              autoComplete="new-password"
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
              color: 'var(--text-main)' 
            }}>
              <Lock size={14} color="var(--primary)" /> 
              <span>ยืนยันรหัสผ่านใหม่</span>
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง"
              autoComplete="new-password"
              style={{ width: '100%' }}
            />
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

          <div style={{ display: 'flex', gap: '12px', marginTop: '0.5rem' }}>
            {!isFirstLogin && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => navigate(-1)} 
                style={{ flex: 1, borderRadius: '14px' }} 
                disabled={loading}
              >
                ยกเลิก
              </Button>
            )}
            <Button 
              type="submit" 
              variant="primary" 
              loading={loading} 
              icon={<Check size={16} />} 
              style={{ flex: 1, borderRadius: '14px' }}
            >
              บันทึกรหัสผ่านใหม่
            </Button>
          </div>

          {isFirstLogin && (
            <button
              type="button"
              onClick={logout}
              style={{
                background: 'transparent', 
                border: 'none', 
                color: 'var(--text-muted)',
                fontSize: '0.8rem', 
                cursor: 'pointer', 
                textDecoration: 'underline',
                marginTop: '8px',
                fontWeight: 600,
              }}
            >
              ออกจากระบบ
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
