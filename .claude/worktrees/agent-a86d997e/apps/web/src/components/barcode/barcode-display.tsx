'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';

interface BarcodeDisplayProps {
  value: string;
  format?: 'code128' | 'ean13' | 'qrcode';
  width?: number;
  height?: number;
  label?: string;
}

export function BarcodeDisplay({
  value,
  format = 'code128',
  width = 250,
  height = 100,
  label,
}: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;

    const render = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment
        // @ts-ignore – bwip-js v4 types are in exports.browser, resolved at runtime
        const bwipjs = (await import('bwip-js')) as any; // eslint-disable-line
        const canvas = canvasRef.current;
        if (!canvas) return;

        bwipjs.toCanvas(canvas, {
          bcid: format,
          text: value,
          scale: 2,
          height: Math.floor(height / 10),
          includetext: true,
          textxalign: 'center',
        });
        setError(null);
      } catch (err: any) {
        setError(err.message ?? 'Failed to render barcode');
      }
    };

    render();
  }, [value, format, width, height]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `barcode-${value}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imgData = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barcode — ${label ?? value}</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
            img { max-width: 300px; }
            p { font-family: monospace; font-size: 12px; margin-top: 4px; }
          </style>
        </head>
        <body>
          <img src="${imgData}" alt="${value}" />
          ${label ? `<p>${label}</p>` : ''}
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  if (!value) {
    return (
      <div className="flex items-center justify-center w-full h-24 bg-gray-100 rounded-lg text-gray-400 text-sm">
        No value to display
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-3">
      {error ? (
        <div className="bg-red-50 rounded-lg p-3 text-sm text-red-600 max-w-xs text-center">
          {error}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="max-w-full rounded-lg border border-gray-200"
          style={{ maxWidth: width }}
        />
      )}
      {label && <p className="text-xs text-gray-500 font-mono">{label}</p>}
      {!error && (
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <Download size={12} />
            Download
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <Printer size={12} />
            Print
          </button>
        </div>
      )}
    </div>
  );
}
