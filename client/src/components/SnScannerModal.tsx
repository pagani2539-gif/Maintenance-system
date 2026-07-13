import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import Tesseract from 'tesseract.js';
import { X, ScanLine, Camera, Check, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import AppDialog from './ui/AppDialog';

interface SnScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** ส่งค่า S/N ที่สแกนได้กลับไป — return true ถ้ารับเข้า (ไม่ซ้ำ/ไม่เกิน), false ถ้าปฏิเสธ */
  onDetected: (value: string) => boolean;
  /** S/N ที่มีอยู่แล้ว ใช้กันสแกนซ้ำ */
  knownSns?: string[];
}

type ScanMode = 'barcode' | 'ocr';

export const SnScannerModal: React.FC<SnScannerModalProps> = ({ isOpen, onClose, onDetected, knownSns = [] }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastHitRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const [mode, setMode] = useState<ScanMode>('barcode');
  const [error, setError] = useState<string>('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);

  const triggerFeedback = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.06;
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      setTimeout(() => ctx.close(), 200);
    } catch { /* audio optional */ }
    if (navigator.vibrate) navigator.vibrate(60);
  }, []);

  const handleValue = useCallback((raw: string) => {
    const value = raw.trim().replace(/\s+/g, '');
    if (!value) return;

    // กันสแกนค่าเดิมรัวๆ ภายใน 2 วินาที
    const now = Date.now();
    if (lastHitRef.current.value === value && now - lastHitRef.current.at < 2000) return;
    lastHitRef.current = { value, at: now };

    if (knownSns.includes(value) || accepted.includes(value)) {
      setError(`S/N "${value}" มีอยู่แล้ว`);
      return;
    }

    const ok = onDetected(value);
    if (ok) {
      setError('');
      setAccepted(prev => [value, ...prev].slice(0, 50));
      triggerFeedback();
    } else {
      setError('รับ S/N เพิ่มไม่ได้ (ครบจำนวนแล้ว)');
    }
  }, [knownSns, accepted, onDetected, triggerFeedback]);

  // เริ่ม/หยุด การสแกนบาร์โค้ดด้วยกล้อง
  useEffect(() => {
    if (!isOpen || mode !== 'barcode') return;

    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('');

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
      if (result) handleValue(result.getText());
    }).then(controls => {
      if (cancelled) { controls.stop(); return; }
      controlsRef.current = controls;
    }).catch((err) => {
      if (!cancelled) setError(err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
        ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — กรุณาเปิดสิทธิ์กล้องในเบราว์เซอร์'
        : 'ไม่สามารถเปิดกล้องได้');
    });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isOpen, mode, handleValue]);

  // โหมด OCR: เปิดกล้องเปล่าๆ ไว้ให้ผู้ใช้กดถ่าย
  useEffect(() => {
    if (!isOpen || mode !== 'ocr') return;

    let stream: MediaStream | null = null;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.name === 'NotAllowedError'
          ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง'
          : 'ไม่สามารถเปิดกล้องได้');
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [isOpen, mode]);

  const handleOcrCapture = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    setOcrBusy(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = await Tesseract.recognize(canvas, 'eng');
      // เก็บเฉพาะบรรทัดที่มีตัวอักษร/ตัวเลข เลือกบรรทัดที่ยาวสุดเป็น S/N
      const candidates = (data.text || '')
        .split('\n')
        .map(l => l.replace(/[^A-Za-z0-9-]/g, '').trim())
        .filter(l => l.length >= 4);
      if (candidates.length === 0) {
        setError('อ่านตัวอักษรไม่สำเร็จ ลองถ่ายให้ชัด/ใกล้ขึ้น');
      } else {
        candidates.sort((a, b) => b.length - a.length);
        handleValue(candidates[0]);
      }
    } catch {
      setError('ประมวลผล OCR ไม่สำเร็จ');
    } finally {
      setOcrBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Scan serial number"
      busy={ocrBusy}
      closeOnBackdrop={false}
      className="modal-content"
      panelStyle={{ maxWidth: '480px', gap: '1rem' }}
    >
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ScanLine size={20} color="var(--primary)" /> สแกน Serial Number
          </h3>
          <button className="close-btn" onClick={onClose} disabled={ocrBusy} aria-label="ปิด"><X size={20} /></button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--border)', padding: '3px', borderRadius: '8px', gap: '3px' }}>
          {([['barcode', 'บาร์โค้ด / QR'], ['ocr', 'ถ่ายอ่านตัวอักษร (OCR)']] as [ScanMode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '8px', fontSize: '0.8rem', border: 'none', borderRadius: '6px', cursor: 'pointer',
                background: mode === m ? 'var(--bg-card)' : 'transparent',
                color: mode === m ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: mode === m ? 800 : 600
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Camera viewport */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* reticle */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '78%', height: '38%', border: '2px solid rgba(255,255,255,0.85)', borderRadius: '10px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }} />
          </div>
          {flash && <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.35)' }} />}
        </div>

        {error && (
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-light)', border: '1px solid var(--danger-border)', padding: '8px 12px', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        {mode === 'ocr' && (
          <Button type="button" variant="primary" onClick={handleOcrCapture} disabled={ocrBusy} style={{ width: '100%' }}>
            {ocrBusy ? <><Loader2 size={16} className="spin-inline" /> กำลังอ่าน...</> : <><Camera size={16} /> ถ่ายแล้วอ่าน S/N</>}
          </Button>
        )}
        {mode === 'barcode' && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', margin: 0 }}>
            เล็งบาร์โค้ด/QR ให้อยู่ในกรอบ ระบบจะอ่านอัตโนมัติ
          </p>
        )}

        {/* Accepted list */}
        {accepted.length > 0 && (
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--success)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} /> สแกนสำเร็จ {accepted.length} รายการ
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '90px', overflowY: 'auto' }}>
              {accepted.map((sn, i) => (
                <span key={i} style={{ fontSize: '0.72rem', fontWeight: 700, background: 'var(--success-light)', color: 'var(--success)', border: '1px solid var(--success-border)', padding: '3px 8px', borderRadius: '6px' }}>{sn}</span>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <Button type="button" variant="primary" onClick={onClose} style={{ width: '100%' }}>เสร็จสิ้น</Button>
        </div>
    </AppDialog>
  );
};

export default SnScannerModal;
