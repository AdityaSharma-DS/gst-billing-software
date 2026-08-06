// Barcode device (USB/Bluetooth HID) integration preferences — stored per browser/device.
export interface ScannerPrefs {
  enabled: boolean;         // capture scans anywhere on the invoice page
  suffix: 'Enter' | 'Tab';  // terminator most scanners append after the code
  minLength: number;        // ignore bursts shorter than this
}

export const defaultScannerPrefs: ScannerPrefs = { enabled: true, suffix: 'Enter', minLength: 4 };

const key = () => `gst.scanner.${localStorage.getItem('tenantId') ?? 'default'}`;

export function getScannerPrefs(): ScannerPrefs {
  try { return { ...defaultScannerPrefs, ...JSON.parse(localStorage.getItem(key()) || '{}') }; }
  catch { return defaultScannerPrefs; }
}
export function setScannerPrefs(p: ScannerPrefs) { localStorage.setItem(key(), JSON.stringify(p)); }
