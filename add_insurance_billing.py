import re

def modify_billing_engine():
    with open('billing-engine.js', 'r', encoding='utf-8') as f:
        js = f.read()

    # 1. Add insurance fetch in _processBillingTrigger
    target_1 = """const { visitKey, orders = {}, docName } = trigger;
const patId   = trigger.patientId;
const patName = trigger.patientName;"""
    replacement_1 = """const { visitKey, orders = {}, docName } = trigger;
const patId   = trigger.patientId;
const patName = trigger.patientName;

let insuranceObj = trigger.insurance || null;
try {
  const bkSnap = await db.ref(`${BASE}/bookings/${visitKey}`).once('value');
  const bk = bkSnap.val() || {};
  if (bk.insurance) insuranceObj = bk.insurance;
} catch(e) {}
"""
    js = js.replace(target_1, replacement_1)

    # 2. Add insuranceObj to the CONSULT addCharge
    target_2 = """this.addCharge({
patientId: patId, patientName: patName,
visitId: visitKey, docName,
department: 'exam', serviceId: 'CONSULT',
customName: 'كشفية طبيب', price: docFee
});"""
    replacement_2 = """this.addCharge({
patientId: patId, patientName: patName,
visitId: visitKey, docName,
department: 'exam', serviceId: 'CONSULT',
customName: 'كشفية طبيب', price: docFee,
insurance: insuranceObj
});"""
    js = js.replace(target_2, replacement_2)

    # 3. Add insuranceObj to processOrders addCharge
    target_3 = """this.addCharge({
patientId: patId, patientName: patName,
visitId: visitKey, docName, department: dept,
serviceId: name, customName: name
});"""
    replacement_3 = """this.addCharge({
patientId: patId, patientName: patName,
visitId: visitKey, docName, department: dept,
serviceId: name, customName: name,
insurance: insuranceObj
});"""
    js = js.replace(target_3, replacement_3)

    # 4. Modify addCharge item creation to calculate shares if insurance exists
    target_4 = """const item = {
serviceId:           eventData.serviceId,
name:                _B.san(eventData.customName || eventData.serviceId),
price:               price,
billingReferenceId:  billingRefId,
requiresBillingReview: requiresReview,
department:          eventData.department,
addedAt:             _B.now()
};"""
    replacement_4 = """const item = {
serviceId:           eventData.serviceId,
name:                _B.san(eventData.customName || eventData.serviceId),
price:               price,
billingReferenceId:  billingRefId,
requiresBillingReview: requiresReview,
department:          eventData.department,
addedAt:             _B.now()
};

if (eventData.insurance) {
    const pct = (parseFloat(eventData.insurance.patientSharePct) || 0) / 100;
    item.patientShare = parseFloat((price * pct).toFixed(3));
    item.insuranceShare = parseFloat((price - item.patientShare).toFixed(3));
} else {
    item.patientShare = price;
    item.insuranceShare = 0;
}"""
    js = js.replace(target_4, replacement_4)

    # 5. Update existing invoice share totals
    target_5 = """currentItems.push(item);
const newTotal  = currentItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
let   newStatus = existing.status;"""
    replacement_5 = """currentItems.push(item);
const newTotal  = currentItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
const patTotal  = currentItems.reduce((s, i) => s + (parseFloat(i.patientShare) || parseFloat(i.price) || 0), 0);
const insTotal  = currentItems.reduce((s, i) => s + (parseFloat(i.insuranceShare) || 0), 0);
let   newStatus = existing.status;"""
    js = js.replace(target_5, replacement_5)

    target_6 = """invRef.update({
items:    currentItems,
total:    parseFloat(newTotal.toFixed(3)),
status:   newStatus,"""
    replacement_6 = """invRef.update({
items:    currentItems,
total:    parseFloat(newTotal.toFixed(3)),
patientShareTotal: parseFloat(patTotal.toFixed(3)),
insuranceShareTotal: parseFloat(insTotal.toFixed(3)),
status:   newStatus,"""
    js = js.replace(target_6, replacement_6)

    target_7 = """this._invoices[invId] = {
...existing,
items:  currentItems,
total:  parseFloat(newTotal.toFixed(3)),
status: newStatus
};"""
    replacement_7 = """this._invoices[invId] = {
...existing,
items:  currentItems,
total:  parseFloat(newTotal.toFixed(3)),
patientShareTotal: parseFloat(patTotal.toFixed(3)),
insuranceShareTotal: parseFloat(insTotal.toFixed(3)),
status: newStatus
};"""
    js = js.replace(target_7, replacement_7)

    # 6. Create new invoice with shares and National ID fields
    target_8 = """items:       [item],
total:       parseFloat((item.price || 0).toFixed(3)),
status:      requiresReview ? 'pending_review' : 'unpaid',
locked:      false,
createdAt:   _B.now(),"""
    replacement_8 = """items:       [item],
total:       parseFloat((item.price || 0).toFixed(3)),
patientShareTotal: item.patientShare !== undefined ? item.patientShare : parseFloat((item.price || 0).toFixed(3)),
insuranceShareTotal: item.insuranceShare || 0,
insurance:   eventData.insurance || null,
taxNumber:   (typeof _sets !== 'undefined' && _sets.taxNumber) ? _sets.taxNumber : '',
nationalInvoiceNumber: '',
invoiceUUID: 'UUID-' + Date.now() + Math.floor(Math.random()*1000),
status:      requiresReview ? 'pending_review' : 'unpaid',
locked:      false,
createdAt:   _B.now(),"""
    js = js.replace(target_8, replacement_8)

    with open('billing-engine.js', 'w', encoding='utf-8') as f:
        f.write(js)

modify_billing_engine()
print("Successfully injected Insurance and Tax base into billing-engine.js")
