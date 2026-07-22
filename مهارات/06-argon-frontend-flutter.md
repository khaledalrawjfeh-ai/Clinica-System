---
name: argon-frontend-development
description: >
  Frontend development for Argon Medical OS using Flutter. Use when building UI screens,
  widgets, state management, offline mode, clinical forms, dashboards, or medical UI.
  Trigger on: Flutter, widget, screen, state, UI, form, dashboard, offline, navigation,
  provider, Riverpod, BLoC, responsive, mobile, tablet, clinical interface, EMR screen.
---

# Argon Frontend Development (Flutter)

Think like a Senior Flutter Developer who specializes in medical UI and understands that
clinical interfaces have different UX rules than consumer apps. Medical UI must prioritize
accuracy, speed of data entry, and error prevention over aesthetics. A doctor entering the
wrong medication due to a confusing UI is a patient safety issue.

---

## 1. Clinical UI Design Principles

### The Medical UI Ruleset
1. **Clarity over cleverness** — Labels must be unambiguous. "Blood Pressure" not "BP".
   Use both Arabic (ضغط الدم) and English labels where users expect both.
2. **Error prevention > error correction** — Inline validation while typing, not on submit.
3. **Critical information is always visible** — Allergies, chronic conditions, current meds
   must be visible in every clinical context, never hidden behind a tab.
4. **Confirmation for irreversible actions** — Visit completion, prescription write,
   invoice void all require an explicit confirmation dialog.
5. **Feedback is immediate** — Loading indicators for any operation > 200ms.
6. **Offline gracefully** — Queue writes locally, sync on reconnect, never silently lose data.

### Color Conventions for Argon
```dart
// Use semantic colors, not raw hex in clinical screens
class ArgonColors {
  static const criticalRed    = Color(0xFFD32F2F);  // Critical values, alerts
  static const warningAmber   = Color(0xFFF57C00);  // Abnormal values, warnings
  static const normalGreen    = Color(0xFF388E3C);  // Normal ranges, success
  static const infoBlue       = Color(0xFF1976D2);  // Information, in-progress
  static const neutralGray    = Color(0xFF616161);  // Secondary text
  static const backgroundWhite = Color(0xFFFAFAFA); // Clinical background
}
```

---

## 2. State Management — Argon Architecture

### Recommended: Riverpod (with AsyncNotifier)
```dart
// Visit state provider
@riverpod
class VisitNotifier extends _$VisitNotifier {
  @override
  FutureOr<VisitState> build(String visitId) async {
    return _loadVisit(visitId);
  }

  Future<void> addDiagnosis(DiagnosisInput input) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(clinicalServiceProvider).createDiagnosis(
        visitId: visitId, input: input,
      );
      return _loadVisit(visitId);
    });
  }
}

// Usage in widget
final visitAsync = ref.watch(visitNotifierProvider(visitId));
return visitAsync.when(
  data: (visit) => VisitScreen(visit: visit),
  loading: () => const ArgonLoadingIndicator(),
  error: (err, _) => ArgonErrorWidget(error: err),
);
```

### State Categories in Argon
```
Local state (widget-level):   TextField focus, animation state → StatefulWidget/useState
Screen state:                  Form data, UI toggles → StateNotifier
Feature state:                 Visit data, patient data → AsyncNotifier (Riverpod)
Global state:                  Auth session, tenant config → Provider singleton
```

---

## 3. Key Screens Architecture

### EMR Workspace Screen
```
ArgonEMRWorkspace
├── PatientHeaderBar         ← Always visible: name, age, MRN, ALLERGIES banner
├── VitalSignsPanel          ← Collapsible, shows latest vitals
├── SOAPNoteTabs
│   ├── SubjectiveTab        ← Chief complaint, HPI, ROS
│   ├── ObjectiveTab         ← Physical exam, vitals entry
│   ├── AssessmentTab        ← Diagnosis search (ICD-10 autocomplete)
│   └── PlanTab
│       ├── PrescriptionPanel
│       ├── LabOrderPanel
│       ├── RadiologyOrderPanel
│       └── ReferralPanel
└── CompleteVisitButton      ← Triggers completeWorkspaceVisit() with confirmation
```

### Visit Queue Dashboard
```
ClinicDashboard
├── QueueMetricsBar          ← Waiting count, avg wait time, in-progress count
├── FilterRow                ← By department, provider, status
├── VisitQueueList           ← Real-time Firebase listener, sorted by arrival
│   └── VisitQueueCard
│       ├── PatientName + Age
│       ├── WaitTime (auto-updating)
│       ├── TriageLevel badge
│       └── ActionButtons    ← "Start Visit" | "View" | "Discharge"
└── QuickStatsPanel          ← Today's completed visits, revenue, pending lab
```

---

## 4. Clinical Form Patterns

### Diagnosis Search Widget
```dart
class DiagnosisSearchField extends StatelessWidget {
  // ICD-10 autocomplete with debounce
  @override
  Widget build(BuildContext context) {
    return Autocomplete<IcdCode>(
      optionsBuilder: (textEditingValue) async {
        if (textEditingValue.text.length < 2) return const [];
        return await ref.read(icdSearchProvider(textEditingValue.text).future);
      },
      displayStringForOption: (code) => '${code.code} — ${code.arabicLabel}',
      optionLabel: (code) => '${code.code}: ${code.englishLabel}',
      onSelected: (code) => widget.onDiagnosisSelected(code),
    );
  }
}
```

### Vitals Entry Form — Range Validation
```dart
class VitalsEntryForm extends ConsumerWidget {
  final _ranges = {
    'systolicBP':  (min: 50.0,  max: 300.0, unit: 'mmHg'),
    'diastolicBP': (min: 30.0,  max: 200.0, unit: 'mmHg'),
    'heartRate':   (min: 20.0,  max: 300.0, unit: 'bpm'),
    'temperature': (min: 30.0,  max: 44.0,  unit: '°C'),
    'weight':      (min: 0.5,   max: 500.0, unit: 'kg'),
    'spo2':        (min: 50.0,  max: 100.0, unit: '%'),
  };

  String? _validateVital(String field, String? value) {
    final num = double.tryParse(value ?? '');
    if (num == null) return 'أدخل رقماً صحيحاً';
    final range = _ranges[field]!;
    if (num < range.min || num > range.max) {
      return 'القيمة خارج النطاق الطبيعي (${range.min}–${range.max} ${range.unit})';
    }
    return null;
  }
}
```

---

## 5. Offline Mode Strategy

### Offline-First Architecture
```dart
// All clinical writes go through a local queue first
class ClinicalWriteQueue {
  final Box<PendingWrite> _localBox;   // Hive local storage

  Future<void> enqueue(PendingWrite write) async {
    await _localBox.put(write.id, write.copyWith(status: WriteStatus.pending));
    _processPending(); // Try to sync immediately if online
  }

  Future<void> _processPending() async {
    if (!await connectivityService.isOnline) return;
    final pending = _localBox.values.where((w) => w.status == WriteStatus.pending);
    for (final write in pending) {
      try {
        await _submitToFirebase(write);
        await _localBox.put(write.id, write.copyWith(status: WriteStatus.synced));
      } catch (e) {
        await _localBox.put(write.id, write.copyWith(
          status: WriteStatus.failed, error: e.toString(),
        ));
      }
    }
  }
}
```

### What Can Work Offline
- ✅ Read cached patient data and visit information.
- ✅ Enter SOAP notes (queued for sync).
- ✅ Record vitals (queued).
- ❌ Complete visits (requires server-side billing trigger).
- ❌ Generate invoices (requires sequential counter).
- ❌ Dispense controlled substances (requires real-time validation).

---

## 6. Allergy Alert System

```dart
// Display allergy banner - ALWAYS visible in clinical context
class AllergyBanner extends StatelessWidget {
  final List<Allergy> allergies;

  @override
  Widget build(BuildContext context) {
    if (allergies.isEmpty) return const SizedBox.shrink();
    return Container(
      color: ArgonColors.criticalRed,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: [
          const Icon(Icons.warning_amber, color: Colors.white),
          const SizedBox(width: 8),
          Text(
            'تحذير: ${allergies.map((a) => a.substanceName).join(' | ')}',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
```

---

## 7. Anti-Patterns

- ❌ Allowing visit completion without the doctor confirming the diagnosis list.
- ❌ Auto-saving SOAP notes to Firebase directly from TextField onChange (debounce + local state first).
- ❌ Showing raw Firebase errors to clinical users.
- ❌ Using generic form validators — clinical values need domain-aware validation.
- ❌ Building a screen before defining its data model and state.
- ❌ Making API calls in `build()` methods.
- ❌ Mixing UI logic and business logic in the same widget.
- ❌ Single-language UI — Argon serves Arabic-speaking clinical staff.
