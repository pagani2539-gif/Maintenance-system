import React, { useEffect, useState, useCallback } from 'react';
import { technicianApi, userApi } from '../api';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Input } from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { getApiErrorMessage } from '../utils/apiError';
import { Wrench, Plus, Pencil, X, User, Phone, Hash, Boxes } from 'lucide-react';
import type { Technician, User as AppUser } from '../types';

interface EditState {
  id?: number;
  full_name: string;
  code: string;
  phone: string;
  user_id: number | '';
  is_active: boolean;
}

const emptyEdit: EditState = { full_name: '', code: '', phone: '', user_id: '', is_active: true };

const Technicians: React.FC = () => {
  const { notify } = useNotification();
  const { hasPermission } = useAuth();
  const canManageTechnicianStock = hasPermission('manage.technicianStock');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    technicianApi.list()
      .then(setTechnicians)
      .catch(() => notify('ไม่สามารถโหลดรายชื่อช่างได้', 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount pattern
    load();
    userApi.list().then(setUsers).catch(() => { /* linking is optional */ });
  }, [load]);

  const openCreate = () => setEdit({ ...emptyEdit });
  const openEdit = (t: Technician) => setEdit({
    id: t.id, full_name: t.full_name, code: t.code || '', phone: t.phone || '',
    user_id: t.user_id ?? '', is_active: t.is_active === 1,
  });

  const save = async () => {
    if (!edit) return;
    if (!edit.full_name.trim()) { notify('กรุณาระบุชื่อช่าง', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        full_name: edit.full_name.trim(),
        code: edit.code.trim() || undefined,
        phone: edit.phone.trim() || undefined,
        user_id: edit.user_id === '' ? null : Number(edit.user_id),
      };
      if (edit.id) {
        await technicianApi.update(edit.id, { ...payload, is_active: edit.is_active });
        notify('อัปเดตข้อมูลช่างเรียบร้อย', 'success');
      } else {
        await technicianApi.create(payload);
        notify('เพิ่มช่างเรียบร้อย', 'success');
      }
      setEdit(null);
      load();
    } catch (err) {
      notify(getApiErrorMessage(err, 'บันทึกไม่สำเร็จ'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div className="page-title">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Wrench size={24} /> จัดการรายชื่อช่าง</h2>
            <p>รายชื่อช่างที่ถืออะไหล่สำรองประจำตัว (ผูกกับบัญชีผู้ใช้ได้ถ้ามี)</p>
          </div>
          {canManageTechnicianStock && <Button variant="primary" icon={<Plus size={18} />} onClick={openCreate}>เพิ่มช่าง</Button>}
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</p>
        ) : technicians.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center' }}>
            <Wrench size={40} style={{ opacity: 0.2 }} />
            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>ยังไม่มีช่างในระบบ</p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {technicians.map((t) => (
              <Card key={t.id} style={{ padding: '1.25rem', opacity: t.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                        {t.code && <span><Hash size={11} style={{ verticalAlign: '-1px' }} /> {t.code}</span>}
                        {t.phone && <span><Phone size={11} style={{ verticalAlign: '-1px' }} /> {t.phone}</span>}
                      </div>
                      {t.user_username && <div style={{ fontSize: '0.72rem', color: 'var(--primary)', marginTop: '2px' }}>บัญชี: {t.user_username}</div>}
                    </div>
                  </div>
                  {canManageTechnicianStock && <button className="btn btn-text" style={{ padding: '4px' }} onClick={() => openEdit(t)} title="แก้ไข"><Pencil size={16} /></button>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Boxes size={13} /> ถืออะไหล่ {t.item_count ?? 0} รายการ
                  </span>
                  {t.is_active
                    ? <span className="badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>ใช้งาน</span>
                    : <span className="badge" style={{ background: 'var(--bg-app)', color: 'var(--text-muted)' }}>ปิดใช้งาน</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {edit && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setEdit(null)}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Wrench size={20} /> {edit.id ? 'แก้ไขช่าง' : 'เพิ่มช่าง'}</h3>
              <button className="close-btn" onClick={() => setEdit(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Input label="ชื่อช่าง" required value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} placeholder="ชื่อ-นามสกุล" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Input label="รหัสพนักงาน" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="(ถ้ามี)" />
                <Input label="เบอร์โทร" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="(ถ้ามี)" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>ผูกกับบัญชีผู้ใช้ <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(ถ้ามี)</span></label>
                <Select
                  value={edit.user_id}
                  options={[{ value: '', label: '— ไม่ผูกบัญชี —' }, ...users.map((u) => ({ value: u.id, label: `${u.full_name} (${u.username})` }))]}
                  onChange={(value) => setEdit({ ...edit, user_id: value ? Number(value) : '' })}
                />
              </div>
              {edit.id && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
                  เปิดใช้งานช่างคนนี้
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
              <Button variant="outline" style={{ flex: 1 }} onClick={() => setEdit(null)} disabled={saving}>ยกเลิก</Button>
              <Button variant="primary" style={{ flex: 2 }} onClick={save} loading={saving} disabled={saving}>บันทึก</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Technicians;
