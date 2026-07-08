import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Input } from '../components/ui/Input';
import FormSection from '../components/ui/FormSection';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { userApi } from '../api';
import type { User, Permissions } from '../types';
import {
  Users as UsersIcon,
  UserPlus,
  Save,
  Trash2,
  Loader2,
  X,
  Check,
  Shield,
  Lock,
  User as UserIcon,
} from 'lucide-react';

const DEFAULT_REGULAR_PERMISSIONS: Permissions = {
  delete: {
    repairs: false,
    claims: false,
    withdrawals: false,
    inventory: false,
    purchase_orders: false,
    transactions: false,
    stations: false,
  },
  manage: {
    settings: false,
    stations: false,
    companies: false,
    users: false,
    stock_counts: false,
  },
};

const DELETE_LABELS: Array<{ key: keyof NonNullable<Permissions['delete']>; label: string }> = [
  { key: 'repairs', label: 'ลบใบแจ้งซ่อม' },
  { key: 'claims', label: 'ลบใบเคลม' },
  { key: 'withdrawals', label: 'ลบใบเบิก' },
  { key: 'inventory', label: 'ลบอุปกรณ์ในสต็อก' },
  { key: 'purchase_orders', label: 'ลบใบสั่งซื้อ' },
  { key: 'transactions', label: 'ลบประวัติธุรกรรม' },
  { key: 'stations', label: 'ลบสถานี' },
];

interface UserFormState {
  username: string;
  password: string;
  full_name: string;
  is_full: boolean;
  permissions: Permissions;
  force_password_change: boolean;
}

const emptyForm = (): UserFormState => ({
  username: '',
  password: '',
  full_name: '',
  is_full: false,
  permissions: JSON.parse(JSON.stringify(DEFAULT_REGULAR_PERMISSIONS)),
  force_password_change: true,
});

const UserManagement: React.FC = () => {
  const { notify, confirm } = useNotification();
  const { user: currentUser, refreshUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await userApi.list();
      setUsers(list);
    } catch {
      notify('ไม่สามารถโหลดรายชื่อผู้ใช้ได้', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const openCreateModal = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditing(u);
    setForm({
      username: u.username,
      password: '',
      full_name: u.full_name,
      is_full: u.is_full,
      permissions: u.permissions || JSON.parse(JSON.stringify(DEFAULT_REGULAR_PERMISSIONS)),
      force_password_change: false,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const toggleDeletePerm = (key: keyof NonNullable<Permissions['delete']>) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        delete: {
          ...(prev.permissions.delete || {}),
          [key]: !prev.permissions.delete?.[key],
        },
      },
    }));
  };

  const setAllDeletePerms = (value: boolean) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        delete: DELETE_LABELS.reduce(
          (acc, { key }) => ({ ...acc, [key]: value }),
          {} as Permissions['delete']
        ),
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editing) {
      if (!form.username.trim() || !form.password || !form.full_name.trim()) {
        notify('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
      }
      if (form.password.length < 8) {
        notify('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
        return;
      }
    } else if (form.password && form.password.length < 8) {
      notify('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          full_name: form.full_name,
          is_full: form.is_full,
          permissions: form.permissions,
        };
        if (form.password) payload.password = form.password;
        await userApi.update(editing.id, payload);
        notify('บันทึกผู้ใช้เรียบร้อย');
      } else {
        await userApi.create({
          username: form.username,
          password: form.password,
          full_name: form.full_name,
          is_full: form.is_full,
          permissions: form.permissions,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          force_password_change: form.force_password_change as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        notify('เพิ่มผู้ใช้เรียบร้อย');
      }
      closeModal();
      await fetchUsers();
      if (editing && editing.id === currentUser?.id) {
        await refreshUser();
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (err as any)?.response?.data?.error || 'ไม่สามารถบันทึกได้';
      notify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (u: User) => {
    if (u.id === currentUser?.id) {
      notify('ไม่สามารถลบบัญชีตัวเองได้', 'error');
      return;
    }
    const isConfirmed = await confirm({
      title: 'ยืนยันการปิดการใช้งานบัญชี',
      message: `ปิดการใช้งานบัญชี "${u.username}" ใช่หรือไม่?\n(ประวัติการใช้งานยังคงอยู่)`,
      variant: 'warning'
    });
    if (!isConfirmed) return;
    try {
      await userApi.remove(u.id);
      notify('ปิดการใช้งานบัญชีเรียบร้อย');
      await fetchUsers();
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (err as any)?.response?.data?.error || 'ไม่สามารถลบได้';
      notify(message, 'error');
    }
  };

  const handleReactivate = async (u: User) => {
    try {
      await userApi.update(u.id, { is_active: true });
      notify('เปิดบัญชีอีกครั้งแล้ว');
      await fetchUsers();
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (err as any)?.response?.data?.error || 'ไม่สามารถดำเนินการได้';
      notify(message, 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={32} className="spinner" /> กำลังโหลด...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <BackButton />
      <div className="page-header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="page-title">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <UsersIcon size={28} color="var(--primary)" />
            จัดการผู้ใช้
          </h2>
          <p>เพิ่ม แก้ไข หรือปิดบัญชีผู้ใช้ พร้อมกำหนดสิทธิ์การเข้าถึงรายคน</p>
        </div>
        <Button variant="primary" icon={<UserPlus size={16} />} onClick={openCreateModal}>
          เพิ่มผู้ใช้ใหม่
        </Button>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              <th style={th}>ผู้ใช้</th>
              <th style={th}>ชื่อ-สกุล</th>
              <th style={th}>บทบาท</th>
              <th style={th}>สถานะ</th>
              <th style={{ ...th, textAlign: 'right' }}>การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>ไม่มีผู้ใช้</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: u.is_full ? 'linear-gradient(135deg, var(--primary), #1e3a8a)' : 'var(--bg-app)',
                      color: u.is_full ? '#fff' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.9rem', border: u.is_full ? 'none' : '1px solid var(--border)',
                    }}>
                      <UserIcon size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>@{u.username}</div>
                      {u.id === currentUser?.id && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>(คุณ)</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={td}>{u.full_name}</td>
                <td style={td}>
                  {u.is_full ? (
                    <span style={badge('var(--primary-light)', 'var(--primary)')}>
                      <Shield size={11} /> ผู้ดูแลระบบ
                    </span>
                  ) : (
                    <span style={badge('var(--bg-app)', 'var(--text-muted)')}>ผู้ใช้งานทั่วไป</span>
                  )}
                </td>
                <td style={td}>
                  {u.is_active ? (
                    <span style={badge('#d1fae5', '#065f46')}>
                      <Check size={11} /> ใช้งานอยู่
                    </span>
                  ) : (
                    <span style={badge('#fee2e2', '#7f1d1d')}>
                      <X size={11} /> ปิดการใช้งาน
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <Button variant="outline" onClick={() => openEditModal(u)} style={{ fontSize: '0.75rem', padding: '6px 12px', marginRight: '6px' }}>
                    แก้ไข
                  </Button>
                  {u.is_active ? (
                    <Button
                      variant="outline"
                      onClick={() => handleSoftDelete(u)}
                      style={{ fontSize: '0.75rem', padding: '6px 12px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      disabled={u.id === currentUser?.id}
                    >
                      <Trash2 size={12} /> ปิดบัญชี
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => handleReactivate(u)} style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                      เปิดบัญชี
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div style={modalOverlay} onClick={closeModal}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                {editing ? <Save size={20} color="var(--primary)" /> : <UserPlus size={20} color="var(--primary)" />}
                {editing ? `แก้ไขผู้ใช้: ${editing.username}` : 'เพิ่มผู้ใช้ใหม่'}
              </h3>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
              <FormSection title="ข้อมูลบัญชี" icon={<UserIcon size={18} />} columns={1}>
                {!editing && (
                  <Input
                    label="ชื่อผู้ใช้ (Username)"
                    required
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="worker1"
                    autoComplete="off"
                  />
                )}
                <Input
                  label="ชื่อ-สกุล (แสดงในเอกสาร)"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="ช่างสมชาย ใจดี"
                />
                <Input
                  label={editing ? 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)' : 'รหัสผ่าน (≥ 6 ตัวอักษร)'}
                  type="password"
                  required={!editing}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••"
                  autoComplete="new-password"
                />
                {!editing && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={form.force_password_change}
                      onChange={(e) => setForm({ ...form, force_password_change: e.target.checked })}
                    />
                    บังคับเปลี่ยนรหัสผ่านในการเข้าใช้งานครั้งแรก
                  </label>
                )}
              </FormSection>

              <FormSection title="สิทธิ์การใช้งาน" icon={<Shield size={18} />} columns={1}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--bg-app)', borderRadius: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.is_full}
                    onChange={(e) => setForm({ ...form, is_full: e.target.checked })}
                    disabled={editing?.id === currentUser?.id}
                  />
                  <Shield size={14} color="var(--primary)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>ผู้ดูแลระบบ</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>มีสิทธิ์ทุกอย่าง รวมถึงจัดการผู้ใช้และตั้งค่าระบบ</div>
                  </div>
                </label>

                {!form.is_full && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={14} color="var(--primary)" />
                        สิทธิ์การลบข้อมูล
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" onClick={() => setAllDeletePerms(true)} style={chip}>ติ๊กทั้งหมด</button>
                        <button type="button" onClick={() => setAllDeletePerms(false)} style={chip}>ล้างทั้งหมด</button>
                      </div>
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px',
                      padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-app)',
                    }}>
                      {DELETE_LABELS.map(({ key, label }) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!form.permissions.delete?.[key]}
                            onChange={() => toggleDeletePerm(key)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </FormSection>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>ยกเลิก</Button>
                <Button type="submit" variant="primary" icon={editing ? <Save size={14} /> : <Check size={14} />} loading={saving}>
                  {editing ? 'บันทึก' : 'สร้างผู้ใช้'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: '0.85rem', verticalAlign: 'middle' };

const badge = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '3px 10px', borderRadius: '6px', background: bg, color, fontWeight: 700, fontSize: '0.72rem',
});

const chip: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px',
  padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', color: 'var(--text-muted)',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 2000, padding: '20px',
};

const modalContent: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '520px',
  maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
};

const modalHeader: React.CSSProperties = {
  padding: '16px 24px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

export default UserManagement;
