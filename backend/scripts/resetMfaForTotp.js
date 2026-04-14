require("dotenv").config({ path: "../.env" });
const { sequelize } = require("../config/database");
const User = require("../models/User");

async function run() {
  await sequelize.authenticate();
  const updated = await User.update(
    { mfaEnabled: false, mfaSecret: null, mfaFailedAttempts: 0, mfaLockUntil: null },
    { where: {} }
  );
  console.log("Reset all users MFA for TOTP re-enrollment. Rows updated:", updated[0]);
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
