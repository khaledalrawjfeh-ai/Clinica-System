// 📊 Argon Professional Excel Export Engine
// Powered by ExcelJS

async function exportProfessionalExcel() {
  toast('⏳ جاري تجميع وتحليل البيانات... يرجى الانتظار', '');
  
  try {
    // 1. Fetch entire clinic snapshot for comprehensive export
    const snap = await db.ref(BASE).once('value');
    const data = snap.val() || {};
    
    // 2. Initialize ExcelJS Workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Argon Medical OS';
    wb.lastModifiedBy = 'Argon System Admin';
    wb.created = new Date();
    
    // ── Helper: Style Header Row ──
    const styleHeader = (row, ws) => {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Teal
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Tajawal', size: 12 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
        };
      });
      row.height = 25;
      ws.views = [{ rightToLeft: true }];
    };

    // ── Helper: Style Data Row ──
    const styleDataRow = (row) => {
      row.eachCell((cell) => {
        cell.font = { name: 'Tajawal', size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: {style:'thin', color: {argb:'FFEEEEEE'}}, 
          left: {style:'thin', color: {argb:'FFEEEEEE'}}, 
          bottom: {style:'thin', color: {argb:'FFEEEEEE'}}, 
          right: {style:'thin', color: {argb:'FFEEEEEE'}}
        };
      });
      row.height = 20;
    };

    // ==========================================
    // SHEET 1: GENERAL SUMMARY (ملخص العيادة)
    // ==========================================
    const ws1 = wb.addWorksheet('ملخص العيادة', { views: [{ rightToLeft: true }] });
    
    const settings = data.settings || {};
    const stats = data.stats || {};
    
    ws1.getColumn('A').width = 30;
    ws1.getColumn('B').width = 40;
    
    // Title
    ws1.mergeCells('A1:B2');
    const titleCell = ws1.getCell('A1');
    titleCell.value = 'التقرير الشامل - ' + (settings.name || 'العيادة');
    titleCell.font = { name: 'Tajawal', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const genData = [
      ['تاريخ استخراج التقرير', new Date().toLocaleString('ar-JO')],
      ['إجمالي الحجوزات المسجلة', stats.totalBookings || 0],
      ['إجمالي الإيرادات (المحسوبة)', (stats.totalIncome || 0).toFixed(2) + ' د.أ'],
      ['إجمالي زيارات النظام الإلكتروني', stats.visitors || 0],
      ['حالة العيادة الحالية', settings.status === 'open' ? 'مفتوحة' : 'مغلقة'],
      ['نمط التشغيل', settings.mode === 'medical_complex' ? 'مجمع طبي متكامل' : 'عيادة منفردة']
    ];

    let rIdx = 4;
    genData.forEach(item => {
      const row = ws1.getRow(rIdx++);
      row.values = item;
      row.getCell(1).font = { bold: true, name: 'Tajawal', size: 12 };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      styleDataRow(row);
    });

    // ==========================================
    // SHEET 2: ALL BOOKINGS (سجل الحجوزات)
    // ==========================================
    const ws2 = wb.addWorksheet('سجل الحجوزات', { views: [{ rightToLeft: true }] });
    ws2.columns = [
      { header: 'رقم المرجع', key: 'ref', width: 15 },
      { header: 'التاريخ', key: 'date', width: 15 },
      { header: 'الوقت', key: 'time', width: 12 },
      { header: 'اسم المريض', key: 'patName', width: 30 },
      { header: 'رقم الهاتف', key: 'phone', width: 20 },
      { header: 'الطبيب المعالج', key: 'docName', width: 25 },
      { header: 'التكلفة (د.أ)', key: 'cost', width: 15 },
      { header: 'الحالة', key: 'status', width: 15 },
      { header: 'تاريخ الإنشاء', key: 'created', width: 20 }
    ];
    styleHeader(ws2.getRow(1), ws2);

    const bookings = data.bookings || {};
    const doctors = data.doctors || {};
    let totalConfirmedRev = 0;

    Object.entries(bookings).forEach(([bk, bv]) => {
      let stTxt = bv.status === 'new' ? 'جديد' : 
                 (bv.status === 'confirmed' ? 'مؤكد' : 
                 (bv.status === 'waiting' ? 'انتظار' : 
                 (bv.status === 'completed' ? 'مكتمل' : 'ملغي')));
                 
      const doc = doctors[bv.docKey] || {};
      const docName = doc.name ? 'د. ' + doc.name : (bv.docKey === 'clinic' ? 'العيادة العامة' : 'غير محدد');
      const cost = parseFloat(bv.fee || doc.fee || 0);

      if(bv.status === 'completed' || bv.status === 'confirmed') totalConfirmedRev += cost;

      const row = ws2.addRow({
        ref: bk.substring(1, 8),
        date: bv.date,
        time: bv.time,
        patName: bv.name,
        phone: bv.phone,
        docName: docName,
        cost: cost.toFixed(2),
        status: stTxt,
        created: new Date(bv.createdAt).toLocaleString('ar-JO')
      });
      styleDataRow(row);
      
      // Status coloring
      const stCell = row.getCell('status');
      if(bv.status === 'completed') stCell.font = { color: { argb: 'FF10B981' }, bold: true };
      if(bv.status === 'cancelled') stCell.font = { color: { argb: 'FFEF4444' }, bold: true };
    });

    // ==========================================
    // SHEET 3: DOCTORS PERFORMANCE (أداء الأطباء)
    // ==========================================
    const ws3 = wb.addWorksheet('أداء الأطباء', { views: [{ rightToLeft: true }] });
    ws3.columns = [
      { header: 'اسم الطبيب', key: 'name', width: 30 },
      { header: 'التخصص', key: 'spec', width: 25 },
      { header: 'كشفية الطبيب (د.أ)', key: 'fee', width: 18 },
      { header: 'متوسط التقييم', key: 'rating', width: 15 },
      { header: 'إجمالي الحجوزات', key: 'totalBooks', width: 18 },
      { header: 'إجمالي الإيرادات المباشرة (د.أ)', key: 'rev', width: 25 }
    ];
    styleHeader(ws3.getRow(1), ws3);

    Object.entries(doctors).forEach(([dk, dv]) => {
      // Calculate revenue and bookings per doctor
      let dBooks = 0;
      let dRev = 0;
      Object.values(bookings).forEach(b => {
        if(b.docKey === dk && b.status !== 'cancelled') {
          dBooks++;
          if(b.status === 'completed' || b.status === 'confirmed') {
            dRev += parseFloat(b.fee || dv.fee || 0);
          }
        }
      });

      const row = ws3.addRow({
        name: 'د. ' + (dv.name || 'غير محدد'),
        spec: dv.specialty || 'غير محدد',
        fee: parseFloat(dv.fee || 0).toFixed(2),
        rating: parseFloat(dv.avgRating || 0).toFixed(1) + ' / 5.0',
        totalBooks: dBooks,
        rev: dRev.toFixed(2)
      });
      styleDataRow(row);
    });

    // ==========================================
    // SHEET 4: INVOICES & FINANCIALS (المالية والفواتير)
    // ==========================================
    if (data.invoices) {
      const ws4 = wb.addWorksheet('الفواتير التفصيلية', { views: [{ rightToLeft: true }] });
      ws4.columns = [
        { header: 'رقم الفاتورة', key: 'id', width: 15 },
        { header: 'التاريخ', key: 'date', width: 20 },
        { header: 'اسم المريض', key: 'patName', width: 30 },
        { header: 'اسم الطبيب', key: 'docName', width: 25 },
        { header: 'قيمة الكشفية', key: 'fee', width: 15 },
        { header: 'قيمة الخدمات والأدوية', key: 'items', width: 20 },
        { header: 'الإجمالي (د.أ)', key: 'total', width: 15 }
      ];
      styleHeader(ws4.getRow(1), ws4);

      Object.entries(data.invoices).forEach(([ik, iv]) => {
        let itemsSum = 0;
        if(iv.items && Array.isArray(iv.items)) {
            iv.items.forEach(i => itemsSum += parseFloat(i.price || 0));
        }
        
        const row = ws4.addRow({
          id: ik.substring(1, 8),
          date: iv.createdAt ? new Date(iv.createdAt).toLocaleString('ar-JO') : '-',
          patName: iv.patientName || 'غير محدد',
          docName: iv.docName || '-',
          fee: parseFloat(iv.doctorFee || 0).toFixed(2),
          items: itemsSum.toFixed(2),
          total: parseFloat(iv.total || 0).toFixed(2)
        });
        styleDataRow(row);
      });
    }

    // ==========================================
    // SHEET 5: PHARMACY INVENTORY (مخزون الصيدلية)
    // ==========================================
    if (data.pharmacy_inventory) {
        const ws5 = wb.addWorksheet('مخزون الصيدلية', { views: [{ rightToLeft: true }] });
        ws5.columns = [
          { header: 'اسم الدواء / العلاج', key: 'name', width: 35 },
          { header: 'الكمية المتوفرة', key: 'stock', width: 15 },
          { header: 'سعر الوحدة (د.أ)', key: 'price', width: 15 },
          { header: 'وحدة القياس', key: 'unit', width: 15 },
          { header: 'الحد الأدنى للإنذار', key: 'min', width: 18 }
        ];
        styleHeader(ws5.getRow(1), ws5);
  
        Object.values(data.pharmacy_inventory).forEach(item => {
          const row = ws5.addRow({
            name: item.name || '-',
            stock: item.stock || 0,
            price: parseFloat(item.price || 0).toFixed(2),
            unit: item.unit || 'علبة',
            min: item.lowStockAlert || 5
          });
          styleDataRow(row);
          if (item.stock <= (item.lowStockAlert || 5)) {
              row.getCell('stock').font = { color: { argb: 'FFEF4444' }, bold: true }; // Red if low
          }
        });
    }

    // 3. Generate File and Trigger Download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `التقرير_الشامل_لعيادة_${(settings.name || 'أرغون').replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    saveAs(blob, fileName);
    toast('✅ تم تصدير ملف الإكسيل بنجاح!', 'ok');

  } catch (error) {
    console.error('Excel Export Error:', error);
    toast('❌ حدث خطأ أثناء استخراج البيانات: ' + error.message, 'err');
  }
}
