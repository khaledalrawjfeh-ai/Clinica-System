/**
 * ARGON MEDICAL OS — Cloud Functions v1.0
 * Server-Side Role-Based Access Control (RBAC)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Sync custom claims when a staff member is created or updated
 * Trigger Path: clinics/{clinicId}/staff/{uid}
 */
exports.syncStaffClaims = functions.database
  .ref("/clinics/{clinicId}/staff/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const clinicId = context.params.clinicId;

    // If staff was deleted, we might want to remove custom claims
    if (!change.after.exists()) {
      try {
        await admin.auth().setCustomUserClaims(uid, null);
        console.log(`Removed claims for deleted staff: ${uid}`);
      } catch (err) {
        console.error(`Failed to remove claims for ${uid}:`, err);
      }
      return null;
    }

    const staffData = change.after.val();
    const role = staffData.role || "staff";

    try {
      // Set custom user claims on Firebase Auth token
      await admin.auth().setCustomUserClaims(uid, {
        role: role,
        clinicId: clinicId,
      });
      console.log(`Successfully set claim {role: ${role}, clinicId: ${clinicId}} for staff ${uid}`);
    } catch (err) {
      console.error(`Error setting claims for staff ${uid}:`, err);
    }
    return null;
  });

/**
 * Sync custom claims when a doctor is created or updated
 * Trigger Path: clinics/{clinicId}/doctors/{uid}
 */
exports.syncDoctorClaims = functions.database
  .ref("/clinics/{clinicId}/doctors/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const clinicId = context.params.clinicId;

    // If doctor was deleted
    if (!change.after.exists()) {
      try {
        await admin.auth().setCustomUserClaims(uid, null);
        console.log(`Removed claims for deleted doctor: ${uid}`);
      } catch (err) {
        console.error(`Failed to remove claims for ${uid}:`, err);
      }
      return null;
    }

    try {
      // Set custom user claims: Doctor role is fixed
      await admin.auth().setCustomUserClaims(uid, {
        role: "doctor",
        clinicId: clinicId,
      });
      console.log(`Successfully set claim {role: doctor, clinicId: ${clinicId}} for doctor ${uid}`);
    } catch (err) {
      console.error(`Error setting claims for doctor ${uid}:`, err);
    }
    return null;
  });
