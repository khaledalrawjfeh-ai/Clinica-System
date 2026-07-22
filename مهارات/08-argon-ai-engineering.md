---
name: argon-ai-engineering
description: >
  AI and LLM integration patterns for Argon Medical OS. Use when designing AI-powered
  clinical features, integrating Claude API, building RAG systems, clinical decision
  support, prompt engineering for medical contexts, or AI agents. Trigger on: AI, LLM,
  Claude API, GPT, prompt, RAG, embedding, vector, clinical decision support, CDSS,
  AI assistant, suggestion, differential diagnosis, drug suggestion, AI feature.
---

# Argon AI Engineering

Think like a Senior AI Systems Engineer who specializes in healthcare AI and understands
the regulatory and safety constraints of clinical decision support systems. AI in Argon
is an ASSISTANT — it never replaces clinical judgment and all AI outputs require physician
confirmation before being acted upon.

---

## 1. AI Safety Principles for Clinical Systems

### The Non-Negotiables
1. **AI suggests, doctor decides** — Every AI-generated clinical suggestion (diagnosis,
   drug, dose) requires explicit physician confirmation before being saved.
2. **Transparency** — Every AI-generated piece of content is visibly marked as AI-suggested.
3. **Auditability** — AI interactions are logged: prompt, model version, response, user action.
4. **Override always available** — Doctor can always reject or modify AI suggestions.
5. **No autonomous clinical actions** — AI never writes to clinical records without a human
   in the loop.
6. **Graceful failure** — If AI service is unavailable, clinical workflow continues unaffected.

---

## 2. Clinical Use Cases for AI in Argon

### Tier 1 — Already Feasible (Ship Now)
```
Feature                           Risk    Value
──────────────────────────────────────────────────────────────
SOAP note drafting from voice     Low     High  — Reduces documentation time
Diagnosis code suggestion         Low     High  — ICD-10 autocomplete from text
Drug interaction narrative        Low     High  — Plain language explanation of interactions
Lab result interpretation         Medium  High  — "What does this CBC suggest?"
Referral letter drafting          Low     High  — From SOAP note context
Discharge summary generation      Medium  High  — From visit history
Patient education material        Low     Medium— Drug instructions in Arabic
```

### Tier 2 — Requires Validation (Future)
```
Differential diagnosis ranking    High    High  — Requires clinical validation study
Prescription suggestion           High    High  — Must be thoroughly validated
Critical value interpretation     High    High  — Requires specialist oversight
Risk scoring (sepsis, ACS)        High    High  — Must use validated clinical algorithms
```

---

## 3. Claude API Integration Patterns

### Standard Medical Query Pattern
```typescript
async function callArgonAI(
  systemPrompt: string,
  userMessage: string,
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',  // Use the appropriate model
      max_tokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.3,  // Low temp for clinical accuracy
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    }),
  });
  const data = await response.json();
  return data.content[0].text;
}
```

### SOAP Note Drafting Prompt
```typescript
const SOAP_DRAFT_SYSTEM_PROMPT = `
You are a clinical documentation assistant for Argon Medical OS, supporting physicians
in Jordanian clinics. Your task is to draft structured clinical notes in a medical style.

Rules:
- Draft in the language the physician uses (Arabic/English/mixed).
- Use proper medical terminology.
- Do NOT fabricate clinical findings not mentioned in the input.
- Mark all drafted content as [AI DRAFT — REQUIRES PHYSICIAN REVIEW].
- Format output as clearly labeled SOAP sections.
- For diagnoses, always suggest the ICD-10 code in parentheses.
- If clinical information is insufficient for a section, write [INSUFFICIENT DATA].

You are an assistant, not a physician. Your output requires physician review before saving.
`;

const userPrompt = `
Patient: ${patient.age} year old ${patient.gender}
Chief complaint: ${visit.chiefComplaint}
Physician notes (raw): ${visit.rawNotes}
Vital signs: BP ${vitals.bp}, HR ${vitals.hr}, Temp ${vitals.temp}°C, O2 ${vitals.spo2}%
Current medications: ${patient.currentMeds.join(', ')}
Known allergies: ${patient.allergies.join(', ')}

Please draft a SOAP note based on the above information.
`;
```

### Drug Interaction Explanation
```typescript
const INTERACTION_EXPLAIN_PROMPT = `
You are a clinical pharmacist assistant in Argon Medical OS. Explain drug interactions
in clear, concise Arabic and English for a physician audience.

Rules:
- Be accurate and cite the mechanism if known.
- State the clinical significance (minor/moderate/major/contraindicated).
- Suggest practical management if a major interaction exists.
- Keep it under 150 words.
- Do not recommend specific drugs to replace — that's the doctor's decision.
`;
```

---

## 4. RAG (Retrieval-Augmented Generation) for Clinical Knowledge

### Knowledge Base Structure for Argon RAG
```
Clinical Guidelines (المراجع السريرية)
├── Jordan Ministry of Health Protocols
├── WHO Essential Medicines List
├── Drug Formulary (with Jordan-specific brands)
├── ICD-10 Code Descriptions (Arabic)
└── Standard Operating Procedures (SOPs)
```

### RAG Architecture
```
User Query (e.g., "what's first-line treatment for H. pylori in Jordan?")
       ↓
Embed query using OpenAI/Claude embedding model
       ↓
Search vector DB (Pinecone / Supabase pgvector) for relevant clinical chunks
       ↓
Retrieve top-k (5-10) relevant passages
       ↓
Construct prompt: [System prompt] + [Retrieved context] + [User query]
       ↓
Claude API generates answer grounded in retrieved documents
       ↓
Response displayed with source citations
       ↓
AI response logged with: query, retrieved chunks, model response, user action
```

### Embedding Chunking Strategy for Clinical Text
```
- Chunk size: 512-800 tokens (larger preserves clinical context better than small chunks)
- Overlap: 100 tokens
- Metadata per chunk: source, section, page, guideline version, last updated
- Do NOT mix different clinical domains in the same vector store index
```

---

## 5. AI Audit Logging (Mandatory)

Every AI interaction in Argon must be logged:
```typescript
interface AIInteractionLog {
  logId: string;
  tenantId: string;
  userId: string;
  userRole: string;
  visitId?: string;
  patientId?: string;

  feature: 'SOAP_DRAFT' | 'DIAGNOSIS_SUGGEST' | 'INTERACTION_EXPLAIN' |
           'DISCHARGE_DRAFT' | 'RAG_QUERY' | 'OTHER';
  model: string;               // e.g., 'claude-opus-4-6'
  promptHash: string;          // SHA-256 of prompt (not raw for privacy)
  responsePreview: string;     // First 200 chars
  tokensUsed: number;

  // User action on AI output
  action: 'ACCEPTED' | 'MODIFIED' | 'REJECTED' | 'IGNORED';
  modifiedContent?: string;    // What the doctor changed it to
  timestamp: number;
}
```

---

## 6. Anti-Patterns

- ❌ Saving AI-generated clinical content without physician explicit confirmation.
- ❌ Using high temperature (> 0.5) for clinical queries — hallucinates too much.
- ❌ Not marking AI-generated content visually in the UI.
- ❌ Logging full patient data in AI interaction logs (use IDs only, hash prompts).
- ❌ Making AI features block clinical workflow if the AI service is down.
- ❌ Allowing AI to generate and auto-submit ISTD invoices.
- ❌ No rate limiting on AI API calls (cost and latency risk).
- ❌ Trusting AI diagnosis suggestions for billing without physician sign-off.
- ❌ Using GPT-4 when Claude is configured — always use the configured Argon AI provider.
