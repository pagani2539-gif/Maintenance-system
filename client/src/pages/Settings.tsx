import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Input, TextArea } from '../components/ui/Input';
import FormSection from '../components/ui/FormSection';
import { useNotification } from '../components/Layout';
import { settingsApi, UPLOAD_URL } from '../api';
import { getApiErrorMessage } from '../utils/apiError';
import type { Company, CompanyLogo, SystemSettings } from '../types';
import {
  Building2,
  MapPin,
  Save,
  Image as ImageIcon,
  Upload,
  Trash2,
  Star,
  StarOff,
  Loader2,
  Settings as SettingsIcon,
  Plus,
  Check,
  X,
  Database,
  Download,
  RefreshCw,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';

const emptyCompany = (): Company => ({
  id: 0,
  name_th: '',
  name_en: '',
  name_short: '',
  address: '',
  phone: '',
  email: '',
  tax_id: '',
  website: '',
  is_default: 0,
});

const Settings: React.FC = () => {
  const { notify, confirm } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'companies' | 'system' | 'backups'>('companies');

  // Companies States
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Company>(emptyCompany());
  const [isCreating, setIsCreating] = useState(false);
  const [logos, setLogos] = useState<CompanyLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const selectedCompany = companies.find((c) => c.id === selectedId);

  // System Settings States
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    line_token_repair: '',
    line_token_stock: '',
    line_channel_access_token: '',
  });
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  // Database Backups States
  const [backups, setBackups] = useState<Array<{ filename: string; size: number; created_at: string }>>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [targetBackup, setTargetBackup] = useState<string | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const list = await settingsApi.getCompanies();
      setCompanies(list);
      if (list.length > 0 && selectedId === null) {
        const defaultCompany = list.find((c) => c.is_default === 1) || list[0];
        setSelectedId(defaultCompany.id);
        setForm(defaultCompany);
      }
    } catch {
      notify('ไม่สามารถโหลดข้อมูลบริษัทได้', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, selectedId]);

  const fetchLogos = useCallback(async (companyId: number) => {
    try {
      const list = await settingsApi.getLogos(companyId);
      setLogos(list);
    } catch {
      notify('ไม่สามารถโหลดโลโก้ได้', 'error');
    }
  }, [notify]);

  const fetchSystemSettings = useCallback(async () => {
    try {
      const data = await settingsApi.getSystemSettings();
      setSystemSettings({
        line_token_repair: data.line_token_repair || '',
        line_token_stock: data.line_token_stock || '',
        line_channel_access_token: data.line_channel_access_token || '',
      });
    } catch {
      notify('ไม่สามารถโหลดข้อมูลตั้งค่าระบบได้', 'error');
    }
  }, [notify]);

  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const list = await settingsApi.getBackups();
      setBackups(list);
    } catch {
      notify('ไม่สามารถโหลดรายการไฟล์สำรองข้อมูลได้', 'error');
    } finally {
      setLoadingBackups(false);
    }
  }, [notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCompanies();
      fetchSystemSettings();
      fetchBackups();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCompanies, fetchSystemSettings, fetchBackups]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedId && !isCreating) {
        fetchLogos(selectedId);
      } else {
        setLogos([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedId, isCreating, fetchLogos]);

  // Companies Handlers
  const handleSelectCompany = (company: Company) => {
    setSelectedId(company.id);
    setForm(company);
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    setSelectedId(null);
    setForm(emptyCompany());
    setIsCreating(true);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    if (companies.length > 0) {
      const target = companies.find((c) => c.is_default === 1) || companies[0];
      setSelectedId(target.id);
      setForm(target);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name_th.trim()) {
      notify('กรุณาระบุชื่อบริษัท (ภาษาไทย)', 'error');
      return;
    }

    setSaving(true);
    try {
      if (isCreating) {
        const result = await settingsApi.createCompany(form);
        notify('เพิ่มบริษัทเรียบร้อย');
        setIsCreating(false);
        setSelectedId(result.id);
        const list = await settingsApi.getCompanies();
        setCompanies(list);
        const newCompany = list.find((c) => c.id === result.id);
        if (newCompany) setForm(newCompany);
      } else if (selectedId) {
        await settingsApi.updateCompany(selectedId, form);
        notify('บันทึกข้อมูลบริษัทเรียบร้อย');
        await fetchCompanies();
      }
    } catch (err) {
      notify(getApiErrorMessage(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedId) return;
    if (companies.length <= 1) {
      notify('ต้องมีบริษัทอย่างน้อย 1 อันในระบบ', 'error');
      return;
    }
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบบริษัท',
      message: `ลบบริษัท "${form.name_th}" ใช่หรือไม่?\n(โลโก้ทั้งหมดของบริษัทนี้จะถูกลบด้วย)\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      variant: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await settingsApi.deleteCompany(selectedId);
      notify('ลบบริษัทเรียบร้อย');
      setSelectedId(null);
      await fetchCompanies();
    } catch {
      notify('ไม่สามารถลบได้', 'error');
    }
  };

  const handleSetDefaultCompany = async () => {
    if (!selectedId) return;
    try {
      await settingsApi.setDefaultCompany(selectedId);
      notify('ตั้งเป็นบริษัทหลักเรียบร้อย');
      await fetchCompanies();
    } catch {
      notify('ไม่สามารถตั้งค่าได้', 'error');
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;

    if (!file.type.startsWith('image/')) {
      notify('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('ไฟล์ต้องไม่เกิน 5MB', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('label', file.name.replace(/\.[^.]+$/, ''));
      formData.append('company_id', String(selectedId));
      await settingsApi.uploadLogo(formData);
      notify('อัปโหลดโลโก้สำเร็จ');
      await fetchLogos(selectedId);
    } catch {
      notify('อัปโหลดล้มเหลว', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetDefaultLogo = async (id: number) => {
    if (!selectedId) return;
    try {
      await settingsApi.setDefaultLogo(id);
      notify('ตั้งเป็นโลโก้หลักของบริษัทแล้ว');
      await fetchLogos(selectedId);
    } catch {
      notify('ไม่สามารถตั้งค่าได้', 'error');
    }
  };

  const handleDeleteLogo = async (id: number, label: string) => {
    if (!selectedId) return;
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบโลโก้',
      message: `ลบโลโก้ "${label}" ใช่หรือไม่?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      variant: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await settingsApi.deleteLogo(id);
      notify('ลบโลโก้เรียบร้อย');
      await fetchLogos(selectedId);
    } catch {
      notify('ไม่สามารถลบได้', 'error');
    }
  };

  // System Settings Handlers
  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await settingsApi.updateSystemSettings(systemSettings);
      notify('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
      fetchSystemSettings();
    } catch (err) {
      notify(getApiErrorMessage(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleTokenVisibility = (key: string) => {
    setShowTokens(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Database Backups Handlers
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await settingsApi.createBackup();
      notify(res.message || 'สำรองข้อมูลสำเร็จ');
      fetchBackups();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      notify(err.response?.data?.error || 'เกิดข้อผิดพลาดในการสำรองข้อมูล', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบไฟล์สำรองข้อมูล',
      message: `คุณแน่ใจว่าต้องการลบไฟล์สำรองข้อมูล "${filename}" ใช่หรือไม่?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      variant: 'danger'
    });
    if (!isConfirmed) return;
    try {
      const res = await settingsApi.deleteBackup(filename);
      notify(res.message || 'ลบสำเร็จ');
      fetchBackups();
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      notify(err.response?.data?.error || 'ไม่สามารถลบไฟล์สำรองได้', 'error');
    }
  };

  const handleOpenRestoreModal = (filename: string) => {
    setTargetBackup(filename);
    setRestorePassword('');
    setRestoreConfirmText('');
    setRestoreModalOpen(true);
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBackup) return;
    if (!restorePassword) {
      notify('กรุณากรอกรหัสผ่านของคุณ', 'error');
      return;
    }
    if (restoreConfirmText !== 'RESTORE') {
      notify('กรุณาพิมพ์คำว่า RESTORE เพื่อกู้คืนข้อมูล', 'error');
      return;
    }

    setRestoring(true);
    try {
      const res = await settingsApi.restoreBackup({
        filename: targetBackup,
        password: restorePassword,
        confirm_text: restoreConfirmText
      });
      notify(res.message || 'กู้คืนฐานข้อมูลสำเร็จ ระบบจะทำรายการรีโหลด...', 'success');
      setRestoreModalOpen(false);
      
      // Reload page after a delay to reopen the DB
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      notify(err.response?.data?.error || 'การยืนยันรหัสผ่านหรือการกู้คืนฐานข้อมูลล้มเหลว', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="responsive-page-content settings-page" style={{ padding: '2rem 2.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <BackButton />
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div className="page-title">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SettingsIcon size={28} color="var(--primary)" />
            ตั้งค่าระบบ
          </h2>
          <p>จัดการข้อมูลบริษัทสำหรับการออกเอกสาร PDF, ตั้งค่าการแจ้งเตือน LINE, และระบบจัดการสำรองข้อมูล</p>
        </div>
      </div>

      {/* Modern Glassmorphism Tab Menu */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '2rem',
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border)',
        padding: '6px',
        borderRadius: '12px',
        width: 'fit-content'
      }}>
        <button
          onClick={() => setActiveTab('companies')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'companies' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'companies' ? '#fff' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Building2 size={16} />
          ข้อมูลบริษัทเอกสาร
        </button>
        <button
          onClick={() => setActiveTab('system')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'system' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'system' ? '#fff' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <SettingsIcon size={16} />
          ตั้งค่าระบบ & LINE
        </button>
        <button
          onClick={() => setActiveTab('backups')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'backups' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'backups' ? '#fff' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Database size={16} />
          สำรองและกู้คืนระบบ
        </button>
      </div>

      {/* TAB CONTENT: 1. Companies */}
      {activeTab === 'companies' && (
        <div className="responsive-master-detail" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* LEFT: Company List */}
          <Card style={{ padding: '1.25rem', position: 'sticky', top: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.95rem' }}>
                <Building2 size={18} color="var(--primary)" />
                บริษัท ({companies.length})
              </h3>
              <Button variant="primary" icon={<Plus size={14} />} onClick={handleStartCreate} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                เพิ่ม
              </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {companies.map((company) => {
                const isActive = company.id === selectedId && !isCreating;
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => handleSelectCompany(company)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: isActive ? 'var(--primary-light)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {company.name_th || '(ไม่มีชื่อ)'}
                      </span>
                      {company.is_default === 1 && (
                        <span style={{
                          fontSize: '0.6rem',
                          background: 'var(--primary)',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}>
                          <Star size={9} fill="white" /> หลัก
                        </span>
                      )}
                    </div>
                    {company.name_en && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {company.name_en}
                      </span>
                    )}
                  </button>
                );
              })}

              {isCreating && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '2px dashed var(--primary)',
                  background: 'var(--primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--primary)',
                }}>
                  <Plus size={14} /> บริษัทใหม่ (ยังไม่บันทึก)
                </div>
              )}
            </div>
          </Card>

          {/* RIGHT: Company details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={32} className="spinner" /> กำลังโหลดข้อมูล...
              </div>
            ) : !selectedId && !isCreating ? (
              <Card style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Building2 size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <div>เลือกบริษัทจากรายการด้านซ้าย หรือกด "เพิ่ม" เพื่อสร้างใหม่</div>
              </Card>
            ) : (
              <>
                <Card style={{ padding: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '12px', flexWrap: 'wrap' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.05rem' }}>
                      <Building2 size={20} color="var(--primary)" />
                      {isCreating ? 'เพิ่มบริษัทใหม่' : 'ข้อมูลบริษัท'}
                    </h3>
                    {!isCreating && selectedCompany && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {selectedCompany.is_default !== 1 && (
                          <Button variant="outline" icon={<Star size={14} />} onClick={handleSetDefaultCompany} style={{ fontSize: '0.75rem' }}>
                            ตั้งเป็นหลัก
                          </Button>
                        )}
                        <Button variant="outline" icon={<Trash2 size={14} />} onClick={handleDeleteCompany} style={{ fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                          ลบบริษัทนี้
                        </Button>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSaveCompany}>
                    <FormSection title="ชื่อบริษัท" icon={<Building2 size={18} />} columns={1}>
                      <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                        <Input
                          label="ชื่อบริษัท (ไทย)"
                          required
                          value={form.name_th}
                          onChange={(e) => setForm({ ...form, name_th: e.target.value })}
                          placeholder="บริษัท ตัวอย่าง จำกัด"
                        />
                        <Input
                          label="ชื่อย่อ (ใช้ในเมนู)"
                          value={form.name_short || ''}
                          onChange={(e) => setForm({ ...form, name_short: e.target.value })}
                          placeholder="ABC"
                        />
                      </div>
                      <Input
                        label="ชื่อบริษัท (อังกฤษ)"
                        value={form.name_en}
                        onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                        placeholder="Example Co., Ltd."
                      />
                    </FormSection>

                    <FormSection title="ที่อยู่ & ติดต่อ" icon={<MapPin size={18} />} columns={1}>
                      <TextArea
                        label="ที่อยู่"
                        rows={3}
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        placeholder="123 ถนน... แขวง... เขต... กรุงเทพฯ 10000"
                      />
                      <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <Input
                          label="เบอร์โทรศัพท์"
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          placeholder="02-xxx-xxxx"
                        />
                        <Input
                          label="อีเมล"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="info@example.com"
                        />
                      </div>
                      <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <Input
                          label="เลขประจำตัวผู้เสียภาษี"
                          value={form.tax_id}
                          onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                          placeholder="0-0000-00000-00-0"
                        />
                        <Input
                          label="เว็บไซต์"
                          value={form.website}
                          onChange={(e) => setForm({ ...form, website: e.target.value })}
                          placeholder="www.example.com"
                        />
                      </div>
                    </FormSection>

                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      {isCreating && (
                        <Button type="button" variant="outline" icon={<X size={16} />} onClick={handleCancelCreate}>
                          ยกเลิก
                        </Button>
                      )}
                      <Button type="submit" variant="primary" icon={isCreating ? <Check size={16} /> : <Save size={16} />} loading={saving}>
                        {isCreating ? 'สร้างบริษัท' : 'บันทึกข้อมูล'}
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* Logos Manager */}
                {!isCreating && selectedId !== null && (
                  <Card style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.05rem' }}>
                        <ImageIcon size={20} color="var(--primary)" />
                        โลโก้ของบริษัทนี้ ({logos.length})
                      </h3>
                      <Button
                        variant="primary"
                        icon={<Upload size={16} />}
                        onClick={() => fileInputRef.current?.click()}
                        loading={uploading}
                        disabled={uploading}
                      >
                        อัปโหลดโลโก้
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadLogo}
                        style={{ display: 'none' }}
                      />
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: '1.25rem' }}>
                      โลโก้ของแต่ละบริษัทแยกกัน — โลโก้ที่ติดดาว = ค่าเริ่มต้นของบริษัทนี้ (ไฟล์ &le; 5MB)
                    </p>

                    {logos.length === 0 ? (
                      <div style={{
                        border: '2px dashed var(--border)',
                        borderRadius: '12px',
                        padding: '3rem 1rem',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                      }}>
                        <ImageIcon size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                        <div style={{ fontSize: '0.9rem' }}>ยังไม่มีโลโก้สำหรับบริษัทนี้</div>
                        <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>คลิกปุ่ม "อัปโหลดโลโก้" เพื่อเริ่มต้น</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
                        {logos.map((logo) => (
                          <div
                            key={logo.id}
                            style={{
                              border: logo.is_default ? '2px solid var(--primary)' : '1px solid var(--border)',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              background: 'var(--bg-card)',
                              position: 'relative',
                            }}
                          >
                            {logo.is_default === 1 && (
                              <div style={{
                                position: 'absolute',
                                top: '6px',
                                left: '6px',
                                background: 'var(--primary)',
                                color: 'white',
                                fontSize: '0.65rem',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                zIndex: 1,
                              }}>
                                <Star size={10} fill="white" /> ค่าเริ่มต้น
                              </div>
                            )}
                            <div style={{
                              width: '100%',
                              height: '120px',
                              background: 'var(--bg-app)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '8px',
                            }}>
                              <img
                                src={`${UPLOAD_URL}/uploads/${logo.file_path}`}
                                alt={logo.label}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              />
                            </div>
                            <div style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)', textAlign: 'center', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {logo.label}
                            </div>
                            <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
                              <button
                                type="button"
                                disabled={logo.is_default === 1}
                                onClick={() => handleSetDefaultLogo(logo.id)}
                                style={{
                                  flex: 1,
                                  padding: '8px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: logo.is_default === 1 ? 'default' : 'pointer',
                                  color: logo.is_default === 1 ? 'var(--text-muted)' : 'var(--primary)',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                                title={logo.is_default === 1 ? 'นี่คือโลโก้ค่าเริ่มต้น' : 'ตั้งเป็นค่าเริ่มต้น'}
                              >
                                {logo.is_default === 1 ? <Star size={12} fill="currentColor" /> : <StarOff size={12} />}
                                {logo.is_default === 1 ? 'หลัก' : 'ตั้งหลัก'}
                              </button>
                              <div style={{ width: '1px', background: 'var(--border)' }} />
                              <button
                                type="button"
                                onClick={() => handleDeleteLogo(logo.id, logo.label)}
                                style={{
                                  flex: 1,
                                  padding: '8px',
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: 'var(--danger)',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                                title="ลบโลโก้"
                              >
                                <Trash2 size={12} /> ลบ
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. System settings */}
      {activeTab === 'system' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <Card style={{ padding: '2rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 0, marginBottom: '1.5rem', fontSize: '1.1rem' }}>
              <SettingsIcon size={22} color="var(--primary)" />
              ตั้งค่าการเชื่อมต่อ API & LINE Messaging API
            </h3>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
              ระบุข้อมูลสำหรับ LINE Messaging API เพื่อเปิดใช้งานระบบแจ้งเตือนเข้าแอปพลิเคชัน LINE (กลุ่ม หรือ บัญชีรายคน)
            </p>

            <form onSubmit={handleSaveSystemSettings}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', background: 'var(--bg-app)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      LINE Channel Access Token
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleTokenVisibility('line_channel_access_token')}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      {showTokens['line_channel_access_token'] ? <EyeOff size={14} /> : <Eye size={14} />}
                      {showTokens['line_channel_access_token'] ? 'ซ่อนรหัส' : 'แสดงรหัส'}
                    </button>
                  </div>
                  <Input
                    type={showTokens['line_channel_access_token'] ? 'text' : 'password'}
                    value={systemSettings.line_channel_access_token || ''}
                    onChange={(e) => setSystemSettings({ ...systemSettings, line_channel_access_token: e.target.value })}
                    placeholder="กรอก LINE Channel Access Token"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0 }}>
                    รหัสผ่านช่องสัญญาณของ LINE Bot ที่ได้จาก LINE Developers Console
                  </p>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', background: 'var(--bg-app)' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.75rem' }}>
                    LINE Target ID (Group ID / User ID) สำหรับงานซ่อมบำรุง / งานเคลม
                  </label>
                  <Input
                    type="text"
                    value={systemSettings.line_token_repair || ''}
                    onChange={(e) => setSystemSettings({ ...systemSettings, line_token_repair: e.target.value })}
                    placeholder="กรอก Target ID ของกลุ่มหรือบัญชีผู้รับแจ้งซ่อม (เช่น C123456... หรือ U123456...)"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0 }}>
                    ระบบจะส่งข้อความไปยัง Target ID นี้ทันทีเมื่อมีการกด "เปิดใบแจ้งซ่อม" หรือ "เปิดใบแจ้งเคลม"
                  </p>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', background: 'var(--bg-app)' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.75rem' }}>
                    LINE Target ID (Group ID / User ID) สำหรับคลังพัสดุ / สต็อกสินค้า
                  </label>
                  <Input
                    type="text"
                    value={systemSettings.line_token_stock || ''}
                    onChange={(e) => setSystemSettings({ ...systemSettings, line_token_stock: e.target.value })}
                    placeholder="กรอก Target ID ของกลุ่มหรือบัญชีผู้รับแจ้งสต็อก (เช่น C123456... หรือ U123456...)"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0 }}>
                    ระบบจะส่งข้อความเมื่อมีการ "เบิกอุปกรณ์", "รับเข้า/นำเข้าพัสดุเข้าคลัง", หรือกรณี "ปริมาณคงเหลือต่ำกว่าเกณฑ์ความปลอดภัย (Min Stock)"
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <Button type="submit" variant="primary" icon={<Save size={16} />} loading={savingSettings}>
                    บันทึกการตั้งค่าระบบ
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* TAB CONTENT: 3. Backups */}
      {activeTab === 'backups' && (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <Card style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, fontSize: '1.1rem' }}>
                  <Database size={22} color="var(--primary)" />
                  ระบบสำรองข้อมูลและกู้คืนฐานข้อมูล (Database Backup)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
                  ฐานข้อมูลทำงานบนระบบ PostgreSQL คุณสามารถกดสั่งดาวน์โหลดไฟล์สำรองหรือสั่งสำรองข้อมูลชุดปัจจุบันได้ที่นี่
                </p>
              </div>

              <Button
                variant="primary"
                icon={<RefreshCw size={16} />}
                onClick={handleCreateBackup}
                loading={creatingBackup}
                disabled={creatingBackup}
              >
                สำรองข้อมูลเดี๋ยวนี้ (Backup Now)
              </Button>
            </div>

            {loadingBackups ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={24} className="spinner" /> กำลังโหลดประวัติสำรองข้อมูล...
              </div>
            ) : backups.length === 0 ? (
              <div style={{
                border: '2px dashed var(--border)',
                borderRadius: '12px',
                padding: '3rem 1rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}>
                <Database size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div style={{ fontSize: '0.9rem' }}>ยังไม่พบไฟล์สำรองข้อมูลในระบบ</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>กดปุ่ม "สำรองข้อมูลเดี๋ยวนี้" เพื่อทำการเริ่มสำรองข้อมูลไฟล์แรก</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>ชื่อไฟล์สำรอง (.dump)</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>ขนาดไฟล์</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>วันที่สำรองข้อมูล</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-muted)', textAlign: 'right' }}>ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.filename} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {b.filename}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                          {formatBytes(b.size)}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                          {new Date(b.created_at).toLocaleString('th-TH')}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <a
                              href={`${UPLOAD_URL}/api/settings/backups/download/${b.filename}`}
                              download
                              className="btn btn-outline"
                              style={{
                                padding: '6px 10px',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                textDecoration: 'none',
                                border: '1px solid var(--border)',
                                color: 'var(--primary)',
                                borderRadius: '8px',
                                fontWeight: 700
                              }}
                              title="ดาวน์โหลดไฟล์สำรอง"
                            >
                              <Download size={14} /> ดาวน์โหลด
                            </a>
                            <Button
                              variant="outline"
                              icon={<RefreshCw size={12} />}
                              onClick={() => handleOpenRestoreModal(b.filename)}
                              style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                              title="กู้คืนฐานข้อมูลจากไฟล์นี้"
                            >
                              กู้คืนระบบ
                            </Button>
                            <Button
                              variant="outline"
                              icon={<Trash2 size={12} />}
                              onClick={() => handleDeleteBackup(b.filename)}
                              style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              title="ลบไฟล์สำรอง"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Database Restore Safety Confirmation Modal */}
      {restoreModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '2rem', borderRadius: '16px', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--danger)', marginBottom: '1rem' }}>
              <Lock size={24} />
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>ยืนยันสิทธิ์การกู้คืนฐานข้อมูล</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              ⚠️ **ข้อควรระวัง:** การกู้คืนระบบจะทำการเขียนข้อมูลฐานข้อมูลหลักทับด้วยไฟล์สำรอง **"{targetBackup}"** ซึ่งข้อมูลในปัจจุบันทั้งหมดที่ไม่ได้สำรองไว้จะสูญหายทันที และเซิร์ฟเวอร์จะทำการรีสตาร์ทตัวใน 1 วินาทีเพื่อเชื่อมต่อใหม่
            </p>

            <form onSubmit={handleConfirmRestore}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <Input
                  type="password"
                  label="รหัสผ่านเข้าสู่ระบบของคุณ"
                  required
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านบัญชีของคุณเพื่อยืนยันตัวตน"
                />

                <Input
                  type="text"
                  label='กรุณาพิมพ์คำว่า "RESTORE" เพื่อยืนยันความเสี่ยง'
                  required
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="RESTORE"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRestoreModalOpen(false)}
                  disabled={restoring}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={restoring}
                  disabled={restoring || restoreConfirmText !== 'RESTORE' || !restorePassword}
                  style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' }}
                >
                  กู้คืนข้อมูลเดี๋ยวนี้
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
