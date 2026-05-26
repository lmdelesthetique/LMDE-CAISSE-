'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Quagga, { QuaggaJSResultObject } from '@ericblade/quagga2';

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minLength?: number;
  /** Max ms between keystrokes to be considered a scanner (default: 50ms) */
  scanSpeed?: number;
}

/**
 * Listens for barcode scanner input on the document.
 * Barcode scanners type characters very quickly (< 50ms between keystrokes)
 * and end with an Enter key press.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 3,
  scanSpeed = 50,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const now = Date.now();
      const timeSinceLast = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        bufferRef.current = '';
        if (barcode.length >= minLength) {
          onScanRef.current(barcode);
        }
        return;
      }

      if (timeSinceLast > scanSpeed && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    },
    [enabled, minLength, scanSpeed]
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);
}

// ─── Camera Barcode Scanner ───────────────────────────────────────────────────

export type CameraScanStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

interface UseCameraBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

interface UseCameraBarcodeScannerReturn {
  status: CameraScanStatus;
  containerRef: React.RefObject<HTMLDivElement | null>;
  startCamera: () => void;
  stopCamera: () => void;
  isActive: boolean;
}

/**
 * Camera-based barcode scanner using @ericblade/quagga2.
 * Works natively on iOS Safari — pure JS decoding, no BarcodeDetector needed.
 *
 * Flow: startCamera() → status='requesting' → React renders the container div
 * → useEffect attaches Quagga to the mounted ref → status='active'.
 */
export function useCameraBarcodeScanner({
  onScan,
  enabled = true,
}: UseCameraBarcodeScannerOptions): UseCameraBarcodeScannerReturn {
  const [status, setStatus] = useState<CameraScanStatus>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onScanRef = useRef(onScan);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    setIsRunning(false);
    setStatus('idle');
  }, []);

  // Just flips the running flag — Quagga starts in the useEffect below
  // after React has committed the render that mounted the container div.
  const startCamera = useCallback(() => {
    if (!enabled) return;
    setStatus('requesting');
    setIsRunning(true);
  }, [enabled]);

  useEffect(() => {
    if (!isRunning || !containerRef.current) return;

    const container = containerRef.current;
    let active = true;
    let quaggaStarted = false;

    const handleDetected = (result: QuaggaJSResultObject) => {
      if (!active) return;
      const code = result?.codeResult?.code;
      if (!code) return;
      const now = Date.now();
      // Debounce: ignore same code within 2 s
      if (code !== lastScannedRef.current || now - lastScannedTimeRef.current > 2000) {
        lastScannedRef.current = code;
        lastScannedTimeRef.current = now;
        onScanRef.current(code);
      }
    };

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: container,
          constraints: {
            facingMode: 'environment',
            width: { min: 640 },
            height: { min: 480 },
          },
        },
        decoder: {
          readers: [
            'ean_reader',
            'ean_8_reader',
            'code_128_reader',
            'code_39_reader',
            'upc_reader',
            'upc_e_reader',
          ],
        },
        locate: true,
      },
      (err: any) => {
        // If cleanup already ran (React strict-mode double-invoke), stop immediately
        if (!active) {
          try { Quagga.stop(); } catch { /* ignore */ }
          return;
        }
        if (err) {
          const name: string = err?.name ?? String(err);
          setStatus(
            name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'error'
          );
          return;
        }
        Quagga.start();
        quaggaStarted = true;
        Quagga.onDetected(handleDetected);
        setStatus('active');
      }
    );

    return () => {
      active = false;
      Quagga.offDetected(handleDetected);
      if (quaggaStarted) {
        try { Quagga.stop(); } catch { /* ignore */ }
        quaggaStarted = false;
      }
    };
  }, [isRunning]);

  // Cleanup on unmount
  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  return { status, containerRef, startCamera, stopCamera, isActive: status === 'active' };
}
