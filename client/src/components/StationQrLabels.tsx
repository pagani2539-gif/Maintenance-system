import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { inventoryApi } from '../api';
import { useNotification } from './Layout';
import type { AssetLifecycleItem, Withdrawal } from '../types';
import { QrCode, Printer, CheckSquare, Square } from 'lucide-react';

interface StationQrLabelsProps {
  stationId: number;
  stationName: string;
  withdrawals?: Withdrawal[];
}

interface QrItem {
  key: string;
  device_name: string;
  model?: string;
  serial_number?: string;
  station_name: string;
  contract_no?: string;
  contract_year?: number;
  has_sn: boolean;
}

const buildLabelText = (item: QrItem, stationName: string): string => {
  const lines = [
    `อุปกรณ์: ${item.device_name}${item.model ? ` (${item.model})` : ''}`,
  ];
  if (item.serial_number) lines.push(`S/N: ${item.serial_number}`);
  lines.push(
    `สถานี: ${item.station_name || stationName}`,
    `สัญญา: ${item.contract_no || '-'}`,
    `ปี: ${item.contract_year || '-'}`,
  );
  return lines.join('\n');
};

const StationQrLabels: React.FC<StationQrLabelsProps> = ({ stationId, stationName, withdrawals }) => {
  const { notify } = useNotification();
  const [instances, setInstances] = useState<AssetLifecycleItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    inventoryApi.getLifecycleReport()
      .then(list => setInstances(list.filter(i => i.station_id === stationId && i.asset_kind === 'serial' && Boolean(i.serial_number))))
      .catch(err => console.error('Failed to load station assets for QR labels:', err));
  }, [stationId]);

  const allItems = useMemo<QrItem[]>(() => {
    const snItems: QrItem[] = instances.map(i => ({
      key: `sn-${i.instance_id}`,
      device_name: i.device_name,
      model: i.model,
      serial_number: i.serial_number!,
      station_name: i.station_name || stationName,
      contract_no: i.contract_no,
      contract_year: i.contract_year,
      has_sn: true,
    }));

    const nonSnItems: QrItem[] = [];
    const seen = new Set<string>();
    (withdrawals || []).forEach(w => {
      (w.items || []).forEach(item => {
        if (item.requires_sn !== 0) return;
        const k = `nsn-${item.inventory_id}-${w.contract_id ?? 'none'}`;
        if (seen.has(k)) return;
        seen.add(k);
        nonSnItems.push({
          key: k,
          device_name: item.item_name,
          model: item.item_model,
          station_name: stationName,
          contract_no: w.contract_no,
          contract_year: w.contract_year,
          has_sn: false,
        });
      });
    });

    return [...snItems, ...nonSnItems];
  }, [instances, withdrawals, stationName]);

  const allSelected = allItems.length > 0 && selected.size === allItems.length;
  const headerCount = `${selected.size}/${allItems.length}`;

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev =>
      prev.size === allItems.length ? new Set() : new Set(allItems.map(i => i.key))
    );
  };

  const handlePrint = async () => {
    const chosen = allItems.filter(i => selected.has(i.key));
    if (chosen.length === 0) {
      notify('กรุณาเลือกอุปกรณ์อย่างน้อย 1 ชิ้นเพื่อพิมพ์ป้าย', 'error');
      return;
    }
    setPrinting(true);
    try {
      // สร้าง QR data URLs
      const built = await Promise.all(chosen.map(async item => ({
        ...item,
        qrDataUrl: await QRCode.toDataURL(buildLabelText(item, stationName), { margin: 1, width: 240 }),
      })));

      // QR บน / ชื่อล่างกลาง — S/N แสดงใต้ชื่อเพื่อแยกแยะชิ้น
      const labelsHtml = built.map(item => `
        <div class="label">
          <img src="${item.qrDataUrl}" width="110" height="110" />
          <div class="name">
            ${escHtml(item.device_name)}
            ${item.model ? `<span class="model">${escHtml(item.model)}</span>` : ''}
          </div>
          ${item.serial_number
            ? `<div class="sn">S/N: ${escHtml(item.serial_number)}</div>`
            : `<div class="no-sn">ไม่มี S/N</div>`}
        </div>`).join('');

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        notify('กรุณาอนุญาตให้เปิด Pop-up window เพื่อพิมพ์', 'error');
        return;
      }

      // หัวกระดาษ — บอกบริบทของแผ่นป้าย (สถานี + วันที่พิมพ์ snapshot + จำนวน)
      const printedAt = new Date().toLocaleString('th-TH', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      printWindow.document.write(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>ป้าย QR อุปกรณ์ — ${escHtml(stationName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { margin: 0; padding: 0; font-family: 'Anuphan', 'Noto Sans Thai', 'Thonburi', sans-serif; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; border-bottom: 2px solid #29b6f6; padding-bottom: 6px; margin-bottom: 12px; }
    .sheet-head .station { font-size: 15px; font-weight: 800; color: #0f172a; }
    .sheet-head .station small { display: block; font-size: 10px; font-weight: 600; color: #29b6f6; letter-spacing: .04em; }
    .sheet-head .meta { font-size: 10px; color: #64748b; text-align: right; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .label { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; border: 1px solid #cbd5e1; border-top: 3px solid #29b6f6; border-radius: 6px; padding: 12px 10px 10px; break-inside: avoid; page-break-inside: avoid; text-align: center; }
    .name { font-size: 12px; font-weight: 800; color: #000; word-break: break-word; line-height: 1.4; }
    .model { display: block; font-size: 10px; font-weight: 400; color: #444; margin-top: 2px; }
    .sn { font-size: 10px; font-weight: 700; color: #000; letter-spacing: .02em; }
    .no-sn { display: inline-block; font-size: 8px; font-weight: 600; color: #94a3b8; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1px 6px; }
  </style>
</head>
<body>
  <div class="sheet-head">
    <div class="station"><small>ป้าย QR อุปกรณ์ — ตรวจหน้างาน</small>${escHtml(stationName)}</div>
    <div class="meta">พิมพ์เมื่อ ${escHtml(printedAt)}<br/>จำนวน ${built.length} ป้าย</div>
  </div>
  <div class="grid">${labelsHtml}</div>
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
    </script>
  </body>
</html>`);
      printWindow.document.close();
    } catch (err) {
      console.error('Failed to generate QR labels:', err);
      notify('สร้างป้าย QR ไม่สำเร็จ', 'error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '8px', padding: '12px 16px', background: 'var(--bg-app)', border: 'none', cursor: 'pointer',
          color: 'var(--text-main)', fontWeight: 800, fontSize: '0.92rem'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <QrCode size={18} color="var(--primary)" /> พิมพ์ป้าย QR อุปกรณ์ (ออฟไลน์ — ตรวจหน้างาน)
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{open ? 'ซ่อน ▲' : 'เปิด ▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '12px 16px' }}>
          {allItems.length === 0 ? (
            <div style={{
              padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--border)',
              borderRadius: '10px', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600
            }}>
              <QrCode size={28} style={{ marginBottom: '8px', opacity: 0.3 }} />
              <div>ยังไม่มีอุปกรณ์ที่สามารถพิมพ์ป้ายได้</div>
              <div style={{ fontSize: '0.72rem', marginTop: '4px', fontWeight: 400 }}>
                ป้าย QR จะปรากฏหลังจากเบิกอุปกรณ์มาติดตั้งที่สถานีนี้
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={toggleAll}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700, fontSize: '0.82rem' }}
                >
                  {allSelected ? <CheckSquare size={16} /> : <Square size={16} />} เลือกทั้งหมด ({headerCount})
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={printing}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: printing ? 'var(--text-muted)' : 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: printing ? 'not-allowed' : 'pointer' }}
                >
                  <Printer size={16} /> {printing ? 'กำลังสร้าง...' : 'พิมพ์ป้าย QR'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                {allItems.map(item => (
                  <label
                    key={item.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                      borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer',
                      background: selected.has(item.key) ? 'var(--primary-light)' : 'var(--bg-card)'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.key)}
                      onChange={() => toggle(item.key)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ flex: 1, fontSize: '0.82rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.device_name}</span>
                      {item.model ? ` (${item.model})` : ''}
                      {item.has_sn && item.serial_number && (
                        <span style={{ marginLeft: '6px', fontWeight: 700, color: 'var(--primary)' }}>
                          · S/N: {item.serial_number}
                        </span>
                      )}
                      {!item.has_sn && (
                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 5px' }}>
                          ไม่มี S/N
                        </span>
                      )}
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        📄 {item.contract_no ? `${item.contract_no} (ปี ${item.contract_year})` : 'ไม่ระบุสัญญา'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/** Escape HTML special chars to prevent XSS in the print window */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default StationQrLabels;
