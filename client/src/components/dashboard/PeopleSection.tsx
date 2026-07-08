import React from 'react';
import { Shield, MapPin, Crown, Users } from 'lucide-react';
import Card from '../ui/Card';
import type { DashboardData } from '../../types';

interface PeopleSectionProps {
  supervisors: NonNullable<DashboardData['supervisors']>;
  topRecipients: NonNullable<DashboardData['people']>['topRecipients'];
  unassignedStationsCount: number;
}

/** Zone 6 — บุคลากรและการเบิกจ่าย: ผู้รับผิดชอบด่าน + ผู้เบิกบ่อย */
const PeopleSection: React.FC<PeopleSectionProps> = ({ supervisors, topRecipients, unassignedStationsCount }) => (
  <>
    {/* ผู้รับผิดชอบด่าน */}
    <Card className="dash-card boot-animate stagger-2 dash-span-8">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 className="dash-card-title">ภาระงานและผู้รับผิดชอบด่าน</h3>
          <p className="dash-card-subtitle">ด่านในความดูแลและจำนวนงานซ่อมที่กำลังดำเนินการ</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', fontWeight: 800, background: 'var(--bg-app)', padding: '6px 12px', borderRadius: '8px' }}>
          <span style={{ color: 'var(--text-muted)' }}>ด่านไม่มีผู้ดูแล:</span>
          <span style={{ color: unassignedStationsCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {unassignedStationsCount} ด่าน
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
        {supervisors && supervisors.length > 0 ? (
          supervisors.map((sup, idx) => (
            <div
              key={idx}
              className="dashboard-list-row"
              title={sup.stations_list}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--bg-app)',
                borderRadius: '10px',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: sup.active_repairs > 0 ? 'var(--warning-light)' : 'var(--primary-light)',
                  color: sup.active_repairs > 0 ? 'var(--warning)' : 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Shield size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)' }}>{sup.name}</span>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}>
                      ดูแล {sup.station_count} ด่าน
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: 500
                  }}>
                    <MapPin size={11} style={{ display: 'inline', marginRight: '3px', verticalAlign: 'middle' }} />
                    {sup.stations_list || '-'}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: sup.active_repairs > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {sup.active_repairs}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700 }}>งานซ่อมค้าง</div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ยังไม่มีข้อมูลผู้รับผิดชอบด่าน
          </div>
        )}
      </div>
    </Card>

    {/* ผู้เบิกบ่อยที่สุด (สีเหรียญ = สีตกแต่งอันดับ ไม่ใช่ status token) */}
    <Card className="dash-card boot-animate stagger-3 dash-span-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h3 className="dash-card-title">ผู้เบิกบ่อยที่สุด</h3>
          <p className="dash-card-subtitle">5 อันดับผู้เบิกอุปกรณ์สูงสุด</p>
        </div>
        <Crown size={18} color="#d97706" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {(topRecipients || []).length > 0 ? topRecipients.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: i === 0 ? 'rgba(217,119,6,0.07)' : 'var(--bg-app)', borderRadius: '10px', border: i === 0 ? '1px solid rgba(217,119,6,0.2)' : '1px solid transparent' }}>
            <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', background: i === 0 ? '#d97706' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : 'var(--bg-card)', color: i < 3 ? '#fff' : 'var(--text-muted)', boxShadow: 'var(--elevation-1)' }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{p.items} ชิ้น · {p.count} ใบเบิก</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>{p.count}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>ครั้ง</div>
            </div>
          </div>
        )) : (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <Users size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <div>ยังไม่มีข้อมูลผู้เบิก</div>
          </div>
        )}
      </div>
    </Card>
  </>
);

export default PeopleSection;
