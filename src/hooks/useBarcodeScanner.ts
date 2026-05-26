'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

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

  // Keep callback ref up to date
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if focus is on an input/textarea/select (user is typing manually)
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

      // If too slow between keystrokes, reset buffer (manual typing)
      if (timeSinceLast > scanSpeed && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Only accumulate printable characters
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

export type CameraScanStatus = 'idle' | 'requesting' | 'active' | 'no-detector' | 'denied' | 'error';

interface UseCameraBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

interface UseCameraBarcodeScannerReturn {
  status: CameraScanStatus;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  isActive: boolean;
}

/**
 * Camera-based barcode scanner using the browser's BarcodeDetector API
 * with fallback to manual input for unsupported browsers.
 */
export function useCameraBarcodeScanner({
  onScan,
  enabled = true,
}: UseCameraBarcodeScannerOptions): UseCameraBarcodeScannerReturn {
  const [status, setStatus] = useState<CameraScanStatus>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  }, []);

  const startCamera = useCallback(async () => {
    if (!enabled) return;
    setStatus('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Use BarcodeDetector API if available
      const BarcodeDetectorAPI = (window as any).BarcodeDetector;
      if (!BarcodeDetectorAPI) {
        // Stop the stream — the page will show an iOS file-capture fallback instead
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setStatus('no-detector');
        return;
      }

      setStatus('active');

      if (BarcodeDetectorAPI) {
        const detector = new BarcodeDetectorAPI({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf', 'data_matrix'],
        });

        const scan = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            animFrameRef.current = requestAnimationFrame(scan);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue as string;
              const now = Date.now();
              // Debounce: don't re-scan same code within 2 seconds
              if (code !== lastScannedRef.current || now - lastScannedTimeRef.current > 2000) {
                lastScannedRef.current = code;
                lastScannedTimeRef.current = now;
                onScanRef.current(code);
              }
            }
          } catch { /* ignore detection errors */ }
          animFrameRef.current = requestAnimationFrame(scan);
        };
        animFrameRef.current = requestAnimationFrame(scan);
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setStatus('denied');
      } else {
        setStatus('error');
      }
      streamRef.current = null;
    }
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    status,
    videoRef,
    startCamera,
    stopCamera,
    isActive: status === 'active',
  };
}
