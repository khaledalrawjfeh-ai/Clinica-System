---
name: argon-reporting-systems
description: >
  Reporting, analytics and document generation for Argon Medical OS. Use when building
  financial reports, clinical reports, ISTD-compliant invoices/receipts, PDF generation,
  Excel exports, KPI dashboards, or analytics. Trigger on: report, PDF, invoice, receipt,
  export, analytics, dashboard, KPI, chart, Excel, ISTD, financial summary, billing report,
  patient report, statistics, تقرير, فاتورة, إيصال, تحليل.
---

# Argon Reporting Systems

Think like a Senior Reporting Engineer who understands both financial compliance requirements
(ISTD Jordan) and clinical analytics needs. Reports in a medical system are legal documents —
billing reports, invoices, and receipts must be accurate to the fils (JOD decimal).

---

## 1. Report Taxonomy

### Financial Reports
```
Report                    Audience         Frequency     Legal?
──────────────────────────────────────────────────────────────────
Daily Cash Summary        Cashier/Manager  Daily         No
Outstanding Invoices      Billing Manager  On-demand     No
Monthly Revenue by Dept   Director         Monthly       No
Tax Invoice (فاتورة)       Patient          Per visit     Yes (ISTD)
Payment Receipt (إيصال)   Patient          Per payment   Yes
Credit Note (إشعار دائن)  Patient          When refunded Yes (ISTD)
Insurance Claims Aging    Billing          Weekly        No
Annual Revenue Report     Accountant       Yearly        Tax use
```

### Clinical Reports
```
Report                    Audience         Notes
────────────────────────────────────────────────────────────
Patient Visit Summary     Patient          After each visit
Doctor Daily Summary      Doctor           Visits + revenue
Department Statistics     Director         Volume, diagnoses
Disease Surveillance      Admin            ICD-10 aggregates
Lab Turnaround Times      Lab Manager      Quality metrics
Prescription Analysis     Pharmacist       Drug frequency
```

---

## 2. ISTD-Compliant Invoice (فاتورة ضريبية)

### Required Fields (Jordan ISTD E-Invoicing)
```typescript
interface ISTDTaxInvoice {
  // Header
  invoiceNumber: string;          // Sequential, no gaps (e.g., INV-2025-00142)
  invoiceType: '388' | '381';     // 388=Tax Invoice, 381=Credit Note
  issueDate: string;              // YYYY-MM-DD
  issueTime: string;              // HH:MM:SS
  currency: 'JOD';

  // Seller (العيادة)
  sellerTaxId: string;            // الرقم الضريبي للعيادة (9 digits)
  sellerName_ar: string;          // الاسم القانوني بالعربي
  sellerName_en: string;
  sellerAddress: string;
  sellerPhone: string;

  // Buyer (المريض / المؤمِّن)
  buyerName: string;
  buyerNationalId?: string;       // For individual patients
  buyerTaxId?: string;            // For insurance companies/corporates
  buyerAddress?: string;

  // Line items
  lineItems: Array<{
    lineNumber: number;
    serviceCode: string;
    description_ar: string;
    description_en: string;
    quantity: number;
    unitPrice: number;            // 3 decimal places (fils)
    discount: number;
    taxRate: number;              // 0.16 for taxable services
    taxAmount: number;
    lineTotal: number;
    taxCategory: 'S' | 'Z' | 'E'; // Standard/Zero/Exempt
  }>;

  // Totals
  subtotalBeforeTax: number;
  totalDiscount: number;
  totalTaxableAmount: number;
  totalTaxAmount: number;
  totalExemptAmount: number;
  grandTotal: number;             // In JOD, 3 decimal places

  // QR Code (ISTD spec)
  qrCode: string;                 // Base64 TLV-encoded

  // For Credit Notes only
  originalInvoiceNumber?: string;
  creditReason?: string;
}
```

### QR Code Generation (ISTD TLV Format)
```typescript
function generateISTDQRCode(invoice: ISTDTaxInvoice): string {
  const tlv = (tag: number, value: string): Buffer => {
    const val = Buffer.from(value, 'utf8');
    return Buffer.concat([
      Buffer.from([tag]),
      Buffer.from([val.length]),
      val,
    ]);
  };

  const qrData = Buffer.concat([
    tlv(1, invoice.sellerName_ar),
    tlv(2, invoice.sellerTaxId),
    tlv(3, `${invoice.issueDate}T${invoice.issueTime}`),
    tlv(4, invoice.grandTotal.toFixed(3)),
    tlv(5, invoice.totalTaxAmount.toFixed(3)),
  ]);

  return qrData.toString('base64');
}
```

---

## 3. PDF Generation (Cloud Functions)

### Tech Stack for Argon PDFs
- Use **Puppeteer** (headless Chrome) in Cloud Functions for pixel-perfect PDF output.
- HTML template → Puppeteer renders → PDF buffer → Firebase Storage.
- Alternative: **PDFKit** for programmatic generation (simpler, no Chrome overhead).

### Invoice PDF Template Structure
```html
<!-- Argon Invoice Template (RTL Arabic + LTR English) -->
<html dir="rtl" lang="ar">
<head>
  <style>
    body { font-family: 'Cairo', 'Noto Sans Arabic', sans-serif; direction: rtl; }
    .header { display: flex; justify-content: space-between; }
    .logo { max-height: 80px; }
    .invoice-meta { text-align: left; direction: ltr; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1976D2; color: white; padding: 8px; }
    td { padding: 6px; border-bottom: 1px solid #eee; }
    .totals { text-align: left; direction: ltr; }
    .qr-code { width: 100px; height: 100px; }
    .footer { font-size: 10px; color: #666; text-align: center; }
  </style>
</head>
```

### Puppeteer Cloud Function Pattern
```typescript
export const generateInvoicePDF = functions.https.onCall(async (data, context) => {
  const { invoiceId, tenantId } = data;
  tenantGuard(context, ['billing_manager', 'admin', 'doctor']);

  const invoice = await loadInvoice(tenantId, invoiceId);
  const htmlContent = renderInvoiceTemplate(invoice);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
  });
  await browser.close();

  const filePath = `billing/${tenantId}/invoices/${invoiceId}.pdf`;
  const fileRef = admin.storage().bucket().file(filePath);
  await fileRef.save(pdfBuffer, { contentType: 'application/pdf' });
  const [url] = await fileRef.getSignedUrl({ action: 'read', expires: '03-01-2030' });

  return { pdfUrl: url };
});
```

---

## 4. Excel Export

### Financial Report Export
```typescript
import * as ExcelJS from 'exceljs';

async function generateRevenueReport(
  tenantId: string, month: number, year: number
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('تقرير الإيرادات', { views: [{ rightToLeft: true }] });

  // Header styling
  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = `تقرير الإيرادات — ${month}/${year}`;
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  // Column definitions
  sheet.columns = [
    { header: 'رقم الفاتورة', key: 'invoiceId', width: 18 },
    { header: 'اسم المريض',   key: 'patientName', width: 25 },
    { header: 'القسم',        key: 'dept', width: 18 },
    { header: 'المبلغ (JOD)', key: 'total', width: 15 },
    { header: 'الضريبة',      key: 'tax', width: 12 },
    { header: 'الحالة',       key: 'status', width: 12 },
  ];

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 2, rightToLeft: true }];

  // Number format for currency columns
  ['D', 'E'].forEach(col => {
    sheet.getColumn(col).numFmt = '#,##0.000 "JOD"';
  });

  // Data rows
  const invoices = await loadMonthlyInvoices(tenantId, month, year);
  invoices.forEach(inv => sheet.addRow({
    invoiceId: inv.id,
    patientName: inv.patientName,
    dept: inv.deptName,
    total: inv.total / 1000,       // Convert fils to JOD
    tax: inv.taxAmount / 1000,
    status: inv.status,
  }));

  // Summary row
  const sumRow = sheet.addRow({ invoiceId: 'الإجمالي', total: { formula: `SUM(D3:D${invoices.length + 2})` } });
  sumRow.font = { bold: true };

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}
```

---

## 5. KPI Dashboard Metrics

### Clinic Operations KPIs
```typescript
interface ClinicKPIs {
  // Volume
  visitsToday: number;
  visitsThisMonth: number;
  avgDailyVisits: number;

  // Financial
  revenueToday: number;           // In fils
  revenueThisMonth: number;
  outstandingReceivables: number;
  collectionRate: number;         // Collected / Billed %

  // Clinical
  avgVisitDuration: number;       // Minutes
  avgWaitTime: number;            // Minutes
  noShowRate: number;             // %

  // Insurance
  pendingClaimsCount: number;
  pendingClaimsValue: number;
  avgClaimAge: number;            // Days

  // Lab
  labTurnaroundAvg: number;       // Hours
  criticalResultsUnacked: number; // Must be 0

  // Quality
  revisitRate: number;            // Returns within 7 days %
}
```

---

## 6. Anti-Patterns

- ❌ Generating invoices client-side — PDF generation must be server-side.
- ❌ Using floating-point arithmetic for monetary values — use integer fils/cents.
- ❌ Invoice numbers with gaps (e.g., skip from 141 to 143) — ISTD violation.
- ❌ Reports that include raw patient names without access control.
- ❌ Generating monthly reports by scanning entire RTDB collections (use pre-computed summaries).
- ❌ Not including the QR code on ISTD tax invoices.
- ❌ Exporting reports with Arabic text without RTL formatting.
- ❌ Voiding a paid invoice without creating a credit note.
