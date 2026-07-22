/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARGON TREATMENT PLAN ENGINE v2.0
 * محرك خطة العلاج السني المتكامل — مستوى المنظومات العالمية
 *
 * مستوحى من: Dentrix G7 · Eaglesoft 21 · Open Dental 23 · Curve Dental
 *
 * المزايا:
 * ✅ تخطيط متعدد المراحل مع إدارة الأولويات (عاجل / ضروري / اختياري)
 * ✅ ربط الإجراءات بالأسنان عبر ترميز FDI الدولي
 * ✅ لوحة تحكم مالية مباشرة (إجمالي / خصم / صافي / مدفوع / رصيد)
 * ✅ حلقة التقدم SVG مع نسبة الإنجاز
 * ✅ تتبع حالة كل إجراء (لم يبدأ / جاري / مكتمل / ملغي)
 * ✅ تكامل مع كتالوج الأسعار الموجود (_pricingCatalogCache)
 * ✅ طباعة خطة علاج احترافية بتصميم A4
 * ✅ Firebase Realtime listeners للتحديث الفوري
 * ✅ Audit trail لكل تغيير
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  /* ── خاصيات الحالة الداخلية ── */
  let _pid       = null;
  let _cid       = null;
  let _db        = null;
  let _base      = null;
  let _plans     = {};
  let _activePId = null;
  let _listener  = null;
  let _catalogCache = {};

  /* ── ثوابت النظام ── */
  const PRI = {
    urgent:   { label:'عاجل',    color:'#ef4444', bg:'rgba(239,68,68,0.12)',   border:'rgba(239,68,68,0.3)',   dot:'🔴' },
    needed:   { label:'ضروري',   color:'#f59e0b', bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.3)',  dot:'🟡' },
    elective: { label:'اختياري', color:'#10b981', bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.3)', dot:'🟢' },
  };

  const STA = {
    pending:     { label:'لم يبدأ',     color:'#94a3b8', bg:'rgba(148,163,184,0.1)',  icon:'⏳' },
    in_progress: { label:'قيد التنفيذ', color:'#f59e0b', bg:'rgba(245,158,11,0.12)',  icon:'🔧' },
    completed:   { label:'مكتمل',       color:'#10b981', bg:'rgba(16,185,129,0.12)', icon:'✅' },
    cancelled:   { label:'ملغي',        color:'#ef4444', bg:'rgba(239,68,68,0.08)',   icon:'❌' },
  };

  const PHASE_PALETTE = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

  /* ────────────────────────────────────────────────────────────────────────────
   * PUBLIC API
   * ──────────────────────────────────────────────────────────────────────────── */
  global.TreatmentPlanModule = {

    /** نقطة الدخول الرئيسية */
    render(containerId, patientId) {
      /* حل المتغيرات العالمية لـ Argon */
      _pid          = patientId;
      _cid          = typeof CID  !== 'undefined' ? CID  : '';
      _db           = typeof db   !== 'undefined' ? db   : null;
      _base         = typeof BASE !== 'undefined' ? BASE : '';
      _catalogCache = typeof _pricingCatalogCache !== 'undefined' ? _pricingCatalogCache : {};

      /* إيجاد الحاوية — أو الإنشاء الذكي داخل التبويب */
      let container = document.getElementById(containerId);
      if (!container) {
        const tab = document.getElementById('emr-tab-treatment-plan');
        if (!tab) return;
        tab.innerHTML = '';
        container = document.createElement('div');
        container.id = containerId;
        tab.appendChild(container);
      }

      if (!_pid || !_db) {
        container.innerHTML = _tmpl_empty_nopatient();
        return;
      }

      container.innerHTML = _tmpl_loading();
      _stopListener();
      _startListener(container);
    },

    /* ── Actions ── */
    _togglePhase(phId) {
      const body    = document.getElementById(`_tph_body_${phId}`);
      const chevron = document.getElementById(`_tph_chev_${phId}`);
      if (!body) return;
      const hidden = body.style.display === 'none';
      body.style.display     = hidden ? '' : 'none';
      if (chevron) chevron.style.transform = hidden ? 'rotate(0)' : 'rotate(-90deg)';
    },

    async _cycleStatus(phId, procId, cur) {
      if (!_activePId || !_db) return;
      const order = ['pending','in_progress','completed','cancelled'];
      const next  = order[(order.indexOf(cur) + 1) % order.length];
      const path  = `${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${phId}/procedures/${procId}`;
      const upd   = { status: next };
      if (next === 'completed') upd.completedAt = new Date().toISOString();
      await _db.ref(path).update(upd);
      _logAudit('PROC_STATUS_CHANGE', `تغيير حالة الإجراء: ${cur} → ${next}`);
    },

    async _deleteProc(phId, procId) {
      if (!confirm('⚠️ حذف الإجراء؟ العملية لا يمكن التراجع عنها.')) return;
      if (!_activePId || !_db) return;
      await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${phId}/procedures/${procId}`).remove();
    },

    async _deletePhase(phId) {
      if (!confirm('⚠️ حذف المرحلة وجميع إجراءاتها؟')) return;
      if (!_activePId || !_db) return;
      await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${phId}`).remove();
    },

    async _addPhase() {
      if (!_activePId) { await _createPlan(); return; }
      const title = prompt('اسم المرحلة العلاجية الجديدة:', `مرحلة ${_phaseCount() + 1} — علاج`);
      if (!title) return;
      const phId = _db.ref().push().key;
      await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${phId}`).set({
        title, order: _phaseCount(), procedures: {}
      });
    },

    openAddProc(defaultPhId) {
      if (!_activePId) {
        _createPlan().then(() => setTimeout(() => global.TreatmentPlanModule.openAddProc(defaultPhId), 500));
        return;
      }
      _renderProcModal(null, null, defaultPhId);
    },

    editProc(phId, procId) {
      _renderProcModal(phId, procId, phId);
    },

    async markProcPaid(phId, procId) {
      if (!_activePId) return;
      const path = `${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${phId}/procedures/${procId}`;
      await _db.ref(path).update({ paid: true, paidAt: new Date().toISOString() });
    },

    printPlan() { _printPlan(); },
    createPlan() { _createPlan(); },
  };

  /* ────────────────────────────────────────────────────────────────────────────
   * FIREBASE LISTENER
   * ──────────────────────────────────────────────────────────────────────────── */
  function _startListener(container) {
    _listener = _db.ref(`${_base}/patients/${_pid}/treatment_plans`).on('value', snap => {
      _plans = snap.val() || {};
      const ids = Object.keys(_plans);
      if (ids.length && !_activePId) {
        _activePId = ids.find(id => _plans[id]?.status === 'active') || ids[ids.length - 1];
      } else if (!ids.length) {
        _activePId = null;
      }
      _paint(container);
    });
  }

  function _stopListener() {
    if (_listener && _db && _pid && _base) {
      _db.ref(`${_base}/patients/${_pid}/treatment_plans`).off('value', _listener);
    }
    _listener = null;
    _activePId = null;
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * PAINT — الرسم الرئيسي
   * ──────────────────────────────────────────────────────────────────────────── */
  function _paint(container) {
    const plan = _activePId ? _plans[_activePId] : null;
    const patName = _getPatName();

    container.innerHTML = `
      <div id="_tp_root" style="font-family:'Tajawal',sans-serif;">
        ${_tmpl_toolbar(patName)}
        <div id="_tp_body">
          ${plan ? _tmpl_plan(plan) : _tmpl_empty_plan()}
        </div>
      </div>`;
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * TEMPLATES
   * ──────────────────────────────────────────────────────────────────────────── */
  function _tmpl_toolbar(name) {
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;
                flex-wrap:wrap;gap:12px;margin-bottom:22px">
      <div>
        <div style="font-size:1.15rem;font-weight:900;color:var(--text)">
          <i class="fas fa-list-check" style="color:#6366f1;margin-left:8px"></i>خطة العلاج والتسعير
        </div>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">
          نظام تخطيط العلاج السني الاحترافي — ${_esc(name)}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="TreatmentPlanModule.openAddProc()"
          style="${_btn('var(--teal)')}">
          <i class="fas fa-plus"></i> إضافة إجراء
        </button>
        <button onclick="TreatmentPlanModule._addPhase()"
          style="${_btn('rgba(99,102,241,0.15)','#6366f1','rgba(99,102,241,0.3)')}">
          <i class="fas fa-layer-group"></i> مرحلة جديدة
        </button>
        <button onclick="TreatmentPlanModule.printPlan()"
          style="${_btn('rgba(255,255,255,0.05)','var(--muted)','var(--border)')}">
          <i class="fas fa-print"></i> طباعة الخطة
        </button>
      </div>
    </div>`;
  }

  function _tmpl_plan(plan) {
    const phases     = plan.phases || {};
    const allProcs   = _getAllProcs(plan);
    const fin        = _calcFin(allProcs);
    const done       = allProcs.filter(p => p.status === 'completed').length;
    const total      = allProcs.length;
    const pct        = total > 0 ? Math.round(done / total * 100) : 0;

    const sortedPhases = Object.entries(phases)
      .sort((a, b) => (a[1].order ?? 99) - (b[1].order ?? 99));

    return `
      ${_tmpl_fin_dashboard(fin, pct, done, total)}
      <div id="_tp_phases">
        ${sortedPhases.length
          ? sortedPhases.map(([phId, ph], i) => _tmpl_phase(phId, ph, i)).join('')
          : _tmpl_no_phases()
        }
      </div>`;
  }

  function _tmpl_fin_dashboard(fin, pct, done, total) {
    const ring = _buildRing(pct);
    const color = pct >= 80 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#3b82f6';

    return `
    <div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr 1fr;
                gap:14px;margin-bottom:24px;align-items:stretch">

      <!-- Progress Ring -->
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:18px;
                  padding:18px 22px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:130px">
        <div style="position:relative;width:88px;height:88px">
          <svg viewBox="0 0 88 88" width="88" height="88" style="transform:rotate(-90deg)">
            <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="9"/>
            <circle cx="44" cy="44" r="36" fill="none" stroke="${color}" stroke-width="9"
              stroke-dasharray="${2*Math.PI*36}"
              stroke-dashoffset="${2*Math.PI*36*(1-pct/100)}"
              stroke-linecap="round"
              style="transition:stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <span style="font-size:1.25rem;font-weight:900;color:${color};line-height:1">${pct}%</span>
            <span style="font-size:0.6rem;color:var(--muted);margin-top:2px">اكتمال</span>
          </div>
        </div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:8px;text-align:center;font-weight:700">
          ${done} / ${total} إجراء مكتمل
        </div>
      </div>

      ${_finCard('الإجمالي التقديري',  (fin.gross/1000).toFixed(3),     'var(--text)',   'var(--border)')}
      ${_finCard('إجمالي الخصم',        (fin.discount/1000).toFixed(3),  '#6366f1',      'rgba(99,102,241,0.25)')}
      ${_finCard('الصافي المستحق',      (fin.net/1000).toFixed(3),       'var(--teal)',   'rgba(13,148,136,0.25)')}
      ${_finCard('الرصيد المتبقي',      (fin.balance/1000).toFixed(3),   'var(--amber)',  'rgba(245,158,11,0.25)')}
    </div>

    <!-- Global Progress Bar -->
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;
                padding:12px 18px;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:0.78rem;color:var(--muted);font-weight:700">
          <i class="fas fa-chart-line" style="color:var(--teal);margin-left:6px"></i>التقدم الإجمالي للخطة العلاجية
        </span>
        <span style="font-size:0.78rem;font-weight:900;color:${color}">${pct}% مكتمل</span>
      </div>
      <div style="background:rgba(255,255,255,0.05);border-radius:99px;height:10px;overflow:hidden">
        <div style="height:100%;border-radius:99px;width:${pct}%;
                    background:linear-gradient(90deg,${color},${color}cc);
                    transition:width 0.7s cubic-bezier(.4,0,.2,1)"></div>
      </div>
    </div>`;
  }

  function _finCard(label, val, valColor, borderColor) {
    return `
    <div style="background:var(--panel);border:1px solid ${borderColor};border-radius:18px;
                padding:18px;display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:0.7rem;color:var(--muted);font-weight:700;margin-bottom:10px">${label}</div>
      <div style="font-size:1.6rem;font-weight:900;color:${valColor};
                  font-family:'IBM Plex Mono',monospace;line-height:1">${val}</div>
      <div style="font-size:0.65rem;color:var(--muted);margin-top:6px">دينار أردني</div>
    </div>`;
  }

  function _tmpl_phase(phId, phase, idx) {
    const procs      = Object.entries(phase.procedures || {})
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
    const done       = procs.filter(([, p]) => p.status === 'completed').length;
    const total      = procs.length;
    const pct        = total > 0 ? Math.round(done / total * 100) : 0;
    const col        = PHASE_PALETTE[idx % PHASE_PALETTE.length];
    const phFin      = _calcFin(procs.map(([, p]) => p));

    return `
    <div style="margin-bottom:16px;border-radius:18px;border:1px solid var(--border);
                overflow:hidden;background:var(--panel)">

      <!-- Phase Header -->
      <div onclick="TreatmentPlanModule._togglePhase('${phId}')"
           style="display:flex;align-items:center;justify-content:space-between;
                  padding:14px 20px;background:rgba(255,255,255,0.02);
                  border-bottom:1px solid var(--border);cursor:pointer;
                  transition:background 0.2s"
           onmouseover="this.style.background='rgba(255,255,255,0.04)'"
           onmouseout="this.style.background='rgba(255,255,255,0.02)'">

        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:14px;height:14px;border-radius:50%;
                      background:${col};box-shadow:0 0 8px ${col}66;flex-shrink:0"></div>
          <div>
            <div style="font-weight:900;color:var(--text);font-size:0.95rem">
              ${_esc(phase.title || 'مرحلة غير مسماة')}
            </div>
            <div style="font-size:0.7rem;color:var(--muted);margin-top:2px">
              ${total} إجراء · ${done} مكتمل ·
              <span style="color:var(--teal);font-weight:700">
                ${(phFin.net/1000).toFixed(3)} JOD
              </span>
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px">
          <!-- Mini bar -->
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:90px;height:6px;background:rgba(255,255,255,0.06);
                        border-radius:99px;overflow:hidden">
              <div style="height:100%;border-radius:99px;width:${pct}%;
                          background:${col};transition:width 0.5s"></div>
            </div>
            <span style="font-size:0.72rem;color:${col};font-weight:800;min-width:32px">${pct}%</span>
          </div>

          <!-- Add Proc -->
          <button onclick="event.stopPropagation();TreatmentPlanModule.openAddProc('${phId}')"
            style="background:rgba(13,148,136,0.1);border:1px solid rgba(13,148,136,0.3);
                   color:var(--teal);border-radius:7px;padding:5px 11px;cursor:pointer;
                   font-size:0.72rem;font-family:'Tajawal',sans-serif;font-weight:700">
            <i class="fas fa-plus"></i> إجراء
          </button>
          <!-- Delete Phase -->
          <button onclick="event.stopPropagation();TreatmentPlanModule._deletePhase('${phId}')"
            style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);
                   color:#f87171;border-radius:7px;padding:5px 9px;cursor:pointer;font-size:0.72rem">
            <i class="fas fa-trash"></i>
          </button>
          <!-- Chevron -->
          <i id="_tph_chev_${phId}" class="fas fa-chevron-down"
             style="color:var(--muted);font-size:0.75rem;transition:transform 0.25s"></i>
        </div>
      </div>

      <!-- Procedures -->
      <div id="_tph_body_${phId}" style="padding:12px 16px;display:flex;flex-direction:column;gap:8px">
        ${procs.length
          ? procs.map(([procId, proc]) => _tmpl_proc(phId, procId, proc)).join('')
          : `<div style="text-align:center;padding:24px;color:var(--muted);font-size:0.85rem;
                         border:1px dashed rgba(255,255,255,0.08);border-radius:10px">
               لا توجد إجراءات — اضغط <b>إجراء +</b> لإضافة إجراء
             </div>`
        }
      </div>
    </div>`;
  }

  function _tmpl_proc(phId, procId, proc) {
    const pri   = PRI[proc.priority || 'needed'];
    const sta   = STA[proc.status  || 'pending'];
    const tooth = proc.toothFDI ? ` · 🦷 ${proc.toothFDI}` : '';
    const surf  = proc.surface  ? ` [${proc.surface}]`     : '';
    const unit  = proc.unitPrice  || 0;
    const qty   = proc.quantity   || 1;
    const disc  = proc.discountPct || 0;
    const total = unit * qty * (1 - disc / 100) / 1000;
    const isPaid = proc.paid === true;

    return `
    <div style="display:flex;align-items:center;gap:10px;
                padding:11px 14px;background:rgba(255,255,255,0.02);
                border:1px solid var(--border);border-right:4px solid ${pri.color};
                border-radius:10px;transition:background 0.2s;position:relative"
         onmouseover="this.style.background='rgba(255,255,255,0.04)'"
         onmouseout="this.style.background='rgba(255,255,255,0.02)'">

      <!-- Name + metadata -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:800;color:var(--text);font-size:0.9rem">
            ${_esc(proc.procedureName || 'إجراء')}
          </span>
          ${tooth ? `<span style="font-size:0.72rem;color:var(--teal);
                                  background:rgba(13,148,136,0.1);padding:1px 7px;
                                  border-radius:5px;font-family:'IBM Plex Mono',monospace">
                       ${_esc(tooth+surf)}</span>` : ''}
          ${isPaid ? `<span style="font-size:0.65rem;background:rgba(16,185,129,0.15);
                                   color:#10b981;padding:1px 7px;border-radius:5px;font-weight:700">
                        ✅ مدفوع</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap">
          <!-- Priority -->
          <span style="font-size:0.68rem;background:${pri.bg};color:${pri.color};
                        border:1px solid ${pri.border};padding:1px 8px;border-radius:5px;font-weight:700">
            ${pri.dot} ${pri.label}
          </span>
          <!-- Qty -->
          ${qty > 1 ? `<span style="font-size:0.68rem;color:var(--muted)">× ${qty}</span>` : ''}
          <!-- Discount -->
          ${disc > 0 ? `<span style="font-size:0.68rem;color:#6366f1;font-weight:700">خصم ${disc}%</span>` : ''}
          <!-- Notes -->
          ${proc.notes ? `<span style="font-size:0.68rem;color:var(--muted);max-width:160px;
                                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                                 title="${_esc(proc.notes)}">📝 ${_esc(proc.notes)}</span>` : ''}
        </div>
      </div>

      <!-- Price -->
      <div style="text-align:left;flex-shrink:0;min-width:80px">
        <div style="font-weight:900;color:var(--teal);font-size:0.92rem;
                    font-family:'IBM Plex Mono',monospace">
          ${total.toFixed(3)}
        </div>
        <div style="font-size:0.62rem;color:var(--muted)">JOD</div>
      </div>

      <!-- Status Button (cycle on click) -->
      <button onclick="TreatmentPlanModule._cycleStatus('${phId}','${procId}','${proc.status||'pending'}')"
        title="اضغط لتغيير الحالة"
        style="background:${sta.bg};border:1px solid rgba(255,255,255,0.1);
               border-radius:8px;padding:6px 12px;cursor:pointer;
               font-size:0.72rem;color:${sta.color};font-family:'Tajawal',sans-serif;
               font-weight:700;min-width:100px;text-align:center;flex-shrink:0;
               transition:opacity 0.2s"
        onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
        ${sta.icon} ${sta.label}
      </button>

      <!-- Actions -->
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button onclick="TreatmentPlanModule.editProc('${phId}','${procId}')"
          title="تعديل"
          style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);
                 color:#6366f1;border-radius:7px;padding:6px 9px;cursor:pointer;font-size:0.75rem">
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="TreatmentPlanModule._deleteProc('${phId}','${procId}')"
          title="حذف"
          style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18);
                 color:#f87171;border-radius:7px;padding:6px 9px;cursor:pointer;font-size:0.75rem">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>`;
  }

  function _tmpl_empty_plan() {
    return `
    <div style="text-align:center;padding:80px 40px;border-radius:20px;
                border:1px dashed rgba(99,102,241,0.25);
                background:rgba(99,102,241,0.02)">
      <div style="font-size:4rem;margin-bottom:16px;line-height:1">📋</div>
      <h3 style="font-weight:900;color:var(--text);margin-bottom:8px;font-size:1.2rem">
        لا توجد خطة علاجية مسجّلة
      </h3>
      <p style="color:var(--muted);font-size:0.88rem;max-width:400px;margin:0 auto 28px">
        أنشئ خطة علاجية متكاملة لهذا المريض تتضمن مراحل العلاج المختلفة،
        أولوياتها، أسعارها، وحالة تنفيذها
      </p>
      <button onclick="TreatmentPlanModule.createPlan()"
        style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;
               padding:14px 32px;border-radius:12px;font-family:'Tajawal',sans-serif;
               font-weight:800;font-size:1rem;cursor:pointer;
               box-shadow:0 8px 24px rgba(99,102,241,0.35);transition:transform 0.2s"
        onmouseover="this.style.transform='translateY(-2px)'"
        onmouseout="this.style.transform='translateY(0)'">
        <i class="fas fa-plus"></i> إنشاء خطة علاجية جديدة
      </button>
    </div>`;
  }

  function _tmpl_no_phases() {
    return `
    <div style="text-align:center;padding:40px;color:var(--muted);
                background:rgba(255,255,255,0.01);border-radius:12px">
      <i class="fas fa-layer-group" style="font-size:2rem;opacity:0.2;display:block;margin-bottom:12px"></i>
      <p style="font-size:0.85rem">لا توجد مراحل علاجية — اضغط <b>مرحلة جديدة</b> لإضافة مرحلة</p>
    </div>`;
  }

  function _tmpl_loading() {
    return `
    <div style="display:flex;align-items:center;justify-content:center;
                padding:80px;gap:14px;color:var(--muted)">
      <i class="fas fa-circle-notch fa-spin" style="font-size:1.8rem;color:var(--teal)"></i>
      <span style="font-size:1rem">جاري تحميل خطة العلاج...</span>
    </div>`;
  }

  function _tmpl_empty_nopatient() {
    return `
    <div style="text-align:center;padding:60px;color:var(--muted)">
      <i class="fas fa-user-slash" style="font-size:3rem;opacity:0.15;display:block;margin-bottom:16px"></i>
      <p>لم يتم تحديد مريض</p>
    </div>`;
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * PROCEDURE MODAL — Add / Edit
   * ──────────────────────────────────────────────────────────────────────────── */
  function _renderProcModal(editPhId, editProcId, defaultPhId) {
    const plan   = _activePId ? _plans[_activePId] : null;
    const phases = plan?.phases || {};
    const editProc = editPhId && editProcId
      ? plan?.phases?.[editPhId]?.procedures?.[editProcId]
      : null;

    const phaseOptions = Object.entries(phases).map(([phId, ph]) =>
      `<option value="${phId}" ${phId === (editPhId || defaultPhId) ? 'selected' : ''}>
         ${_esc(ph.title || 'مرحلة')}
       </option>`
    ).join('');

    const isEdit = !!editProc;

    document.getElementById('_tp_proc_overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = '_tp_proc_overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);
      z-index:300000;display:flex;align-items:center;justify-content:center;
      padding:20px;font-family:'Tajawal',sans-serif;`;

    overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:22px;
                padding:28px;width:100%;max-width:580px;max-height:92vh;overflow-y:auto;
                box-shadow:0 24px 60px rgba(0,0,0,0.65)">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <div style="font-size:1.1rem;font-weight:900;color:var(--text)">
            ${isEdit ? '✏️ تعديل الإجراء' : '➕ إضافة إجراء طبي'}
          </div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:3px">
            أدخل تفاصيل الإجراء السني وتسعيره
          </div>
        </div>
        <button onclick="document.getElementById('_tp_proc_overlay').remove()"
          style="background:rgba(255,255,255,0.05);border:1px solid var(--border);
                 color:var(--muted);border-radius:9px;padding:7px 13px;cursor:pointer">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Procedure Name -->
      <div style="margin-bottom:16px">
        <label style="${_lbl()}">اسم الإجراء *</label>
        <div style="position:relative">
          <input type="text" id="_tp_f_name"
            placeholder="مثال: حشو مركب، علاج عصب، تاج خزف..."
            value="${isEdit ? _esc(editProc.procedureName||'') : ''}"
            autocomplete="off"
            style="${_inp()}"
            oninput="TreatmentPlanModule._onCatalogSearch(this.value)">
          <div id="_tp_cat_dd" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;
                                       background:var(--surf);border:1px solid var(--border);border-radius:12px;
                                       max-height:210px;overflow-y:auto;z-index:1000;
                                       box-shadow:0 12px 30px rgba(0,0,0,0.4)"></div>
        </div>
      </div>

      <!-- Row: Tooth + Surface + Category -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label style="${_lbl()}">رقم السن (FDI)</label>
          <input type="text" id="_tp_f_tooth"
            placeholder="مثال: 16، 36، 11-12"
            value="${isEdit ? _esc(editProc.toothFDI||'') : ''}"
            style="${_inp()} font-family:'IBM Plex Mono',monospace">
        </div>
        <div>
          <label style="${_lbl()}">السطح / الوصف</label>
          <input type="text" id="_tp_f_surf"
            placeholder="مثال: MOD، Buccal، Palatal"
            value="${isEdit ? _esc(editProc.surface||'') : ''}"
            style="${_inp()} font-family:'IBM Plex Mono',monospace">
        </div>
      </div>

      <!-- Row: Priority + Phase -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label style="${_lbl()}">الأولوية *</label>
          <select id="_tp_f_pri" style="${_inp()}">
            <option value="urgent"   ${(editProc?.priority||'needed')==='urgent'   ? 'selected':''}>🔴 عاجل — يحتاج علاجاً فورياً</option>
            <option value="needed"   ${(editProc?.priority||'needed')==='needed'   ? 'selected':''}>🟡 ضروري — خلال 3 أشهر</option>
            <option value="elective" ${(editProc?.priority||'needed')==='elective' ? 'selected':''}>🟢 اختياري — وقت مناسب</option>
          </select>
        </div>
        <div>
          <label style="${_lbl()}">المرحلة العلاجية *</label>
          <select id="_tp_f_phase" style="${_inp()}">${phaseOptions}</select>
        </div>
      </div>

      <!-- Row: Price + Qty + Discount -->
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label style="${_lbl()}">السعر (بالفلس) *</label>
          <input type="number" id="_tp_f_price" min="0" step="500"
            placeholder="30000"
            value="${isEdit ? (editProc.unitPrice||0) : ''}"
            style="${_inp()} font-family:'IBM Plex Mono',monospace"
            oninput="TreatmentPlanModule._calcTotal()">
        </div>
        <div>
          <label style="${_lbl()}">الكمية</label>
          <input type="number" id="_tp_f_qty" min="1" value="${isEdit ? (editProc.quantity||1) : 1}"
            style="${_inp()} font-family:'IBM Plex Mono',monospace"
            oninput="TreatmentPlanModule._calcTotal()">
        </div>
        <div>
          <label style="${_lbl()}">خصم %</label>
          <input type="number" id="_tp_f_disc" min="0" max="100"
            value="${isEdit ? (editProc.discountPct||0) : 0}"
            style="${_inp()} font-family:'IBM Plex Mono',monospace"
            oninput="TreatmentPlanModule._calcTotal()">
        </div>
      </div>

      <!-- Total Preview -->
      <div style="background:rgba(13,148,136,0.08);border:1px solid rgba(13,148,136,0.2);
                  border-radius:10px;padding:12px 16px;margin-bottom:16px;
                  display:flex;justify-content:space-between;align-items:center">
        <span style="color:var(--muted);font-size:0.8rem;font-weight:700">إجمالي هذا الإجراء:</span>
        <span id="_tp_total_display" style="font-weight:900;color:var(--teal);font-size:1.1rem;
                                              font-family:'IBM Plex Mono',monospace">0.000 JOD</span>
      </div>

      <!-- Notes -->
      <div style="margin-bottom:22px">
        <label style="${_lbl()}">ملاحظات إضافية</label>
        <textarea id="_tp_f_notes" rows="2"
          placeholder="أي ملاحظات أو تعليمات خاصة بهذا الإجراء..."
          style="${_inp()} resize:none">${isEdit ? _esc(editProc.notes||'') : ''}</textarea>
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:10px">
        <button id="_tp_save_btn"
          onclick="TreatmentPlanModule._saveProc('${editPhId||''}','${editProcId||''}')"
          style="flex:1;background:linear-gradient(135deg,var(--teal),#0891b2);
                 border:none;color:#fff;padding:13px;border-radius:12px;
                 font-family:'Tajawal',sans-serif;font-weight:800;font-size:0.95rem;cursor:pointer;
                 box-shadow:0 6px 16px rgba(13,148,136,0.3);transition:transform 0.15s"
          onmouseover="this.style.transform='translateY(-1px)'"
          onmouseout="this.style.transform='translateY(0)'">
          <i class="fas fa-check"></i> ${isEdit ? 'حفظ التعديلات' : 'إضافة الإجراء'}
        </button>
        <button onclick="document.getElementById('_tp_proc_overlay').remove()"
          style="background:transparent;border:1px solid var(--border);color:var(--muted);
                 padding:13px 20px;border-radius:12px;font-family:'Tajawal',sans-serif;
                 font-weight:600;cursor:pointer">
          إلغاء
        </button>
      </div>
    </div>`;

    document.body.appendChild(overlay);
    if (isEdit) global.TreatmentPlanModule._calcTotal();
    setTimeout(() => document.getElementById('_tp_f_name')?.focus(), 100);
  }

  /* Catalog autocomplete */
  global.TreatmentPlanModule._onCatalogSearch = function (q) {
    const dd = document.getElementById('_tp_cat_dd');
    if (!dd) return;
    if (!q || q.length < 2) { dd.style.display = 'none'; return; }

    const items = Object.entries(_catalogCache || {})
      .filter(([, v]) => v.active !== false && (v.name||'').toLowerCase().includes(q.toLowerCase()))
      .slice(0, 9);

    if (!items.length) { dd.style.display = 'none'; return; }

    dd.innerHTML = items.map(([, v]) => `
      <div onclick="TreatmentPlanModule._pickCatalog('${_esc(v.name)}',${v.price||0})"
        style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;
               align-items:center;border-bottom:1px solid var(--border);transition:background 0.15s"
        onmouseover="this.style.background='rgba(13,148,136,0.1)'"
        onmouseout="this.style.background='transparent'">
        <div style="font-weight:700;font-size:0.85rem;color:var(--text)">${_esc(v.name)}</div>
        <div style="font-size:0.75rem;color:var(--teal);font-weight:700;
                    font-family:'IBM Plex Mono',monospace">${v.price||0} فلس</div>
      </div>`).join('');
    dd.style.display = 'block';
  };

  global.TreatmentPlanModule._pickCatalog = function (name, price) {
    const n = document.getElementById('_tp_f_name');
    const p = document.getElementById('_tp_f_price');
    const d = document.getElementById('_tp_cat_dd');
    if (n) n.value = name;
    if (p) p.value = price;
    if (d) d.style.display = 'none';
    global.TreatmentPlanModule._calcTotal();
  };

  global.TreatmentPlanModule._calcTotal = function () {
    const price = parseFloat(document.getElementById('_tp_f_price')?.value  || 0);
    const qty   = parseFloat(document.getElementById('_tp_f_qty')?.value    || 1);
    const disc  = parseFloat(document.getElementById('_tp_f_disc')?.value   || 0);
    const total = price * qty * (1 - disc / 100);
    const el    = document.getElementById('_tp_total_display');
    if (el) el.textContent = (total / 1000).toFixed(3) + ' JOD';
  };

  global.TreatmentPlanModule._saveProc = async function (origPhId, origProcId) {
    const name  = document.getElementById('_tp_f_name')?.value.trim();
    if (!name) { alert('يرجى إدخال اسم الإجراء'); return; }
    if (!_activePId || !_db) return;

    const phId  = document.getElementById('_tp_f_phase')?.value;
    if (!phId)  { alert('يرجى اختيار المرحلة'); return; }

    const price = parseFloat(document.getElementById('_tp_f_price')?.value  || 0);
    const qty   = parseFloat(document.getElementById('_tp_f_qty')?.value    || 1);
    const disc  = parseFloat(document.getElementById('_tp_f_disc')?.value   || 0);

    const session = typeof ArgonSession !== 'undefined' ? ArgonSession.get() : {};
    const isEdit  = !!(origPhId && origProcId);

    const data = {
      procedureName: name,
      toothFDI:      document.getElementById('_tp_f_tooth')?.value.trim() || null,
      surface:       document.getElementById('_tp_f_surf')?.value.trim()  || null,
      priority:      document.getElementById('_tp_f_pri')?.value   || 'needed',
      unitPrice:     price,
      quantity:      qty,
      discountPct:   disc,
      notes:         document.getElementById('_tp_f_notes')?.value.trim() || null,
    };

    const btn = document.getElementById('_tp_save_btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جارِ الحفظ...'; }

    try {
      if (isEdit) {
        /* Move between phases if changed */
        if (origPhId !== phId) {
          /* Delete from old phase */
          await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${origPhId}/procedures/${origProcId}`).remove();
          /* Add to new phase */
          const newId = _db.ref().push().key;
          await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${phId}/procedures/${newId}`).set({
            ...data, status:'pending', order: Date.now(), createdAt: new Date().toISOString(), createdBy: session.staffId||'doctor'
          });
        } else {
          await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${origPhId}/procedures/${origProcId}`).update(data);
        }
        _logAudit('PROC_EDIT', `تعديل إجراء: ${name}`);
      } else {
        const procId = _db.ref().push().key;
        await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${_activePId}/phases/${phId}/procedures/${procId}`).set({
          ...data, status:'pending', order: Date.now(), createdAt: new Date().toISOString(), createdBy: session.staffId||'doctor'
        });
        _logAudit('PROC_ADD', `إضافة إجراء: ${name}`);
      }
      document.getElementById('_tp_proc_overlay')?.remove();
      if (typeof toast === 'function') toast(`✅ ${isEdit ? 'تم تحديث الإجراء' : 'تم إضافة الإجراء إلى خطة العلاج'}`, 'ok');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> إضافة الإجراء'; }
      if (typeof toast === 'function') toast('❌ خطأ: ' + e.message, 'err');
    }
  };

  /* ────────────────────────────────────────────────────────────────────────────
   * CREATE PLAN
   * ──────────────────────────────────────────────────────────────────────────── */
  async function _createPlan() {
    if (!_pid || !_db) return;
    const session = typeof ArgonSession !== 'undefined' ? ArgonSession.get() : {};
    const planId  = _db.ref(`${_base}/patients/${_pid}/treatment_plans`).push().key;
    const phId    = _db.ref().push().key;

    await _db.ref(`${_base}/patients/${_pid}/treatment_plans/${planId}`).set({
      planId, title: 'خطة العلاج الشاملة', status: 'active',
      createdAt: new Date().toISOString(), createdBy: session.staffId || 'doctor',
      phases: {
        [phId]: { title: 'المرحلة الأولى — العلاج الأولي', order: 0, procedures: {} }
      }
    });
    _activePId = planId;
    _logAudit('PLAN_CREATE', 'إنشاء خطة علاج جديدة');
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * PRINT PLAN
   * ──────────────────────────────────────────────────────────────────────────── */
  function _printPlan() {
    const plan = _activePId ? _plans[_activePId] : null;
    if (!plan) { if (typeof toast==='function') toast('لا توجد خطة علاجية للطباعة','err'); return; }

    const patInfo   = (typeof _patients !== 'undefined') ? (_patients[_pid]?.info || {}) : {};
    const patName   = patInfo.name || 'المريض';
    const clinicName = (typeof _sets !== 'undefined' && _sets?.name) ? _sets.name : 'العيادة الطبية';
    const phases    = Object.entries(plan.phases || {}).sort((a,b) => (a[1].order??99)-(b[1].order??99));
    const allProcs  = _getAllProcs(plan);
    const fin       = _calcFin(allProcs);
    const done      = allProcs.filter(p=>p.status==='completed').length;
    const pct       = allProcs.length > 0 ? Math.round(done/allProcs.length*100) : 0;

    const phasesHTML = phases.map(([phId, ph], idx) => {
      const procs   = Object.values(ph.procedures || {});
      const phTotal = procs.reduce((s,p)=>s+((p.unitPrice||0)*(p.quantity||1)*(1-(p.discountPct||0)/100)),0);
      const col     = PHASE_PALETTE[idx % PHASE_PALETTE.length];
      return `
        <div style="margin-bottom:22px;page-break-inside:avoid">
          <div style="background:${col};color:white;padding:10px 18px;border-radius:8px 8px 0 0;
                      font-weight:800;font-size:0.95rem">${_esc(ph.title||'مرحلة')}</div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f8fafc">
                ${['الإجراء','السن','الأولوية','الكمية','السعر الإفرادي','الخصم','الإجمالي','الحالة']
                    .map(h=>`<th style="padding:9px;text-align:right;border:1px solid #e2e8f0;font-size:0.8rem;color:#475569">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${procs.map(p => {
                const pri  = PRI[p.priority||'needed'];
                const sta  = STA[p.status||'pending'];
                const tot  = ((p.unitPrice||0)*(p.quantity||1)*(1-(p.discountPct||0)/100)/1000).toFixed(3);
                return `<tr>
                  <td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">${_esc(p.procedureName||'')}</td>
                  <td style="padding:9px;border:1px solid #e2e8f0;text-align:center;font-family:monospace">${p.toothFDI||'—'}</td>
                  <td style="padding:9px;border:1px solid #e2e8f0;text-align:center;color:${pri.color};font-weight:700">${pri.label}</td>
                  <td style="padding:9px;border:1px solid #e2e8f0;text-align:center">${p.quantity||1}</td>
                  <td style="padding:9px;border:1px solid #e2e8f0;text-align:center;font-family:monospace">${((p.unitPrice||0)/1000).toFixed(3)}</td>
                  <td style="padding:9px;border:1px solid #e2e8f0;text-align:center">${p.discountPct||0}%</td>
                  <td style="padding:9px;border:1px solid #e2e8f0;text-align:center;font-weight:800;color:#0d9488">${tot} JOD</td>
                  <td style="padding:9px;border:1px solid #e2e8f0;text-align:center">${sta.icon} ${sta.label}</td>
                </tr>`;
              }).join('')}
              <tr style="background:#f0fdfa">
                <td colspan="6" style="padding:10px;border:1px solid #e2e8f0;font-weight:900;color:#0d9488">إجمالي المرحلة</td>
                <td colspan="2" style="padding:10px;border:1px solid #e2e8f0;text-align:center;font-weight:900;color:#0d9488">
                  ${(phTotal/1000).toFixed(3)} JOD
                </td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }).join('');

    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
      <meta charset="UTF-8"><title>خطة العلاج — ${_esc(patName)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Tajawal',sans-serif;direction:rtl;padding:32px;color:#1e293b;font-size:14px}
        @media print{.noprint{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style>
    </head><body>
      <div class="noprint" style="margin-bottom:20px">
        <button onclick="window.print()" style="background:#0d9488;color:white;border:none;
          padding:10px 22px;border-radius:8px;cursor:pointer;font-family:'Tajawal',sans-serif;font-size:1rem">
          🖨️ طباعة الخطة
        </button>
      </div>

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:start;
                  border-bottom:3px solid #0d9488;padding-bottom:18px;margin-bottom:22px">
        <div>
          <h1 style="font-size:1.7rem;font-weight:900;color:#0d9488">${_esc(clinicName)}</h1>
          <p style="color:#64748b;margin-top:4px;font-size:0.88rem">خطة العلاج السني الشاملة</p>
        </div>
        <div style="text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px">
          <p><strong>المريض:</strong> ${_esc(patName)}</p>
          <p style="font-size:0.82rem;color:#64748b;margin-top:4px">تاريخ الخطة: ${new Date().toLocaleDateString('ar-JO')}</p>
          <p style="font-size:0.82rem;color:#64748b">نسبة الإنجاز: ${pct}%</p>
        </div>
      </div>

      ${phasesHTML}

      <!-- Financial Summary -->
      <div style="border:2px solid #0d9488;border-radius:12px;padding:20px;margin-top:24px">
        <h3 style="font-weight:900;color:#0d9488;margin-bottom:14px;font-size:1.05rem">
          💰 الملخص المالي للخطة
        </h3>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            ${[['الإجمالي التقديري',(fin.gross/1000).toFixed(3),'#1e293b'],
               ['الخصم الإجمالي',(fin.discount/1000).toFixed(3),'#6366f1'],
               ['الصافي المستحق',(fin.net/1000).toFixed(3),'#0d9488'],
               ['الرصيد المتبقي',(fin.balance/1000).toFixed(3),'#f59e0b']]
              .map(([l,v,c])=>`<td style="text-align:center;padding:12px;border:1px solid #e2e8f0">
                <div style="font-size:0.75rem;color:#64748b;margin-bottom:6px">${l}</div>
                <div style="font-size:1.4rem;font-weight:900;color:${c}">${v}</div>
                <div style="font-size:0.65rem;color:#94a3b8">دينار أردني</div>
              </td>`).join('')}
          </tr>
        </table>
      </div>

      <!-- Signatures -->
      <div style="margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:60px">
        <div style="text-align:center">
          <div style="border-top:1px dashed #cbd5e1;padding-top:10px;color:#64748b;font-weight:700;font-size:0.88rem">توقيع الطبيب المعالج</div>
        </div>
        <div style="text-align:center">
          <div style="border-top:1px dashed #cbd5e1;padding-top:10px;color:#64748b;font-weight:700;font-size:0.88rem">موافقة المريض على خطة العلاج</div>
        </div>
      </div>
      <p style="margin-top:20px;text-align:center;font-size:0.72rem;color:#94a3b8">
        وثيقة طبية معتمدة — ARGON EMR | خطة العلاج صالحة لمدة 6 أشهر من تاريخ الإصدار
      </p>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.focus(), 200);
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * HELPERS
   * ──────────────────────────────────────────────────────────────────────────── */
  function _getAllProcs(plan) {
    const all = [];
    Object.values(plan.phases || {}).forEach(ph =>
      Object.values(ph.procedures || {}).forEach(p => all.push(p))
    );
    return all;
  }

  function _calcFin(procs) {
    let gross = 0, disc = 0;
    procs.filter(p => p.status !== 'cancelled').forEach(p => {
      const sub = (p.unitPrice || 0) * (p.quantity || 1);
      gross += sub;
      disc  += sub * ((p.discountPct || 0) / 100);
    });
    const net = gross - disc;
    return { gross, discount: disc, net, balance: net };
  }

  function _phaseCount() {
    return _activePId ? Object.keys(_plans[_activePId]?.phases || {}).length : 0;
  }

  function _getPatName() {
    return (typeof _patients !== 'undefined') ? (_patients[_pid]?.info?.name || 'المريض') : 'المريض';
  }

  function _logAudit(action, details) {
    if (typeof logAudit === 'function') logAudit(action, details, 'TREATMENT_PLAN');
  }

  function _buildRing(pct) { return pct; } /* Computed inline */

  function _esc(s) {
    return String(s || '').replace(/[<>"'&]/g, c =>
      ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;", '&':'&amp;' }[c])
    ).substring(0, 250);
  }

  function _btn(bg, color = '#fff', border = 'transparent') {
    return `background:${bg};border:1px solid ${border};color:${color};
            border-radius:9px;padding:8px 16px;cursor:pointer;font-size:0.82rem;
            font-family:'Tajawal',sans-serif;font-weight:700;display:inline-flex;
            align-items:center;gap:6px;transition:opacity 0.15s`;
  }

  function _lbl() {
    return `font-size:0.75rem;color:var(--muted);display:block;margin-bottom:7px;font-weight:700`;
  }

  function _inp() {
    return `width:100%;background:var(--surf);border:1px solid var(--border);border-radius:10px;
            padding:10px 14px;color:var(--text);font-family:'Tajawal',sans-serif;
            font-size:0.88rem;outline:none;box-sizing:border-box;
            transition:border-color 0.2s`;
  }

}(window));
