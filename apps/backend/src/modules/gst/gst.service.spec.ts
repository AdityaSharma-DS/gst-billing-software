import { GstService } from './gst.service';

describe('GstService', () => {
  const gst = new GstService();

  it('splits CGST/SGST for intra-state supply', () => {
    const tax = gst.computeLineTax({ taxableValue: 1000, gstRate: 18 }, true);
    expect(tax.cgst).toBe(90);
    expect(tax.sgst).toBe(90);
    expect(tax.igst).toBe(0);
    expect(tax.total).toBe(1180);
  });

  it('applies full IGST for inter-state supply', () => {
    const tax = gst.computeLineTax({ taxableValue: 1000, gstRate: 18 }, false);
    expect(tax.igst).toBe(180);
    expect(tax.cgst).toBe(0);
    expect(tax.total).toBe(1180);
  });

  it('detects intra-state by matching state code', () => {
    expect(gst.isIntraState('27', '27')).toBe(true);
    expect(gst.isIntraState('27', '29')).toBe(false);
  });
});
