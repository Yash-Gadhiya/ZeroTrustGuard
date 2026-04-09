const { sequelize } = require("./config/database");

async function run() {
  try {
    await sequelize.query("ALTER TABLE accessrequests ADD COLUMN admin_comment TEXT NULL;");
    console.log("Column added");
  } catch (err) {
    console.error("Error adding column:", err.message);
  }
  process.exit(0);
}
run();
