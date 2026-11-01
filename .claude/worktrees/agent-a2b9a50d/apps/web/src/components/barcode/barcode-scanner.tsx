'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose?: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const readerRef = useRef<any>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const startScanner = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library');
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        const devices = await reader.listVideoInputDevices();
        const deviceId = devices.find((d) =>
          d.label.toLowerCase().includes('back'),
        )?.deviceId ?? devices[0]?.deviceId;

        if (!deviceId) {
          setError('No camera found');
          return;
        }

        setScanning(true);

        await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (result) {
              const text = result.getText();
              setScanned(text);
              setScanning(false);
              reader.reset();
            }
          },
        );

        cleanup = () => {
          reader.reset();
        };
      } catch (err: any) {
        setError(err.message ?? 'Failed to start camera');
      }
    };

    startScanner();

    return () => {
      cleanup?.();
      if (readerRef.current) {
        try { readerRef.current.reset(); } catch {}
      }
    };
  }, []);

  const handleReset = async () => {
    setScanned(null);
    setError(null);
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
    }

    // Restart
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/library');
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      setScanning(true);

      const devices = await reader.listVideoInputDevices();
      const deviceId = devices[0]?.deviceId;
      if (deviceId) {
        await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
          if (result) {
            setScanned(result.getText());
            setScanning(false);
            reader.reset();
          }
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-md w-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-gray-600" />
          <h3 className="font-semibold text-gray-900">Scan Barcode / IMEI</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Camera view */}
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          {scanning && !scanned && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="border-2 border-blue-400 w-48 h-32 rounded-lg opacity-70" />
            </div>
          )}
          {scanning && !scanned && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center">
              <span className="bg-black/60 text-white text-xs px-2 py-1 rounded">
                Align barcode within the frame
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
            {error}. Please allow camera access and try again.
          </div>
        )}

        {scanned && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-green-600" />
              <p className="text-sm font-medium text-green-800">Barcode detected</p>
            </div>
            <p className="font-mono text-lg font-bold text-gray-900 text-center py-2 bg-white rounded-lg border border-green-200">
              {scanned}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onScan(scanned)}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Use this barcode
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw size={13} />
                Scan again
              </button>
            </div>
          </div>
        )}

        {!scanned && !error && (
          <p className="text-center text-xs text-gray-500">
            {scanning ? 'Camera active — point at barcode or QR code' : 'Initializing camera...'}
          </p>
        )}
      </div>
    </div>
  );
}
