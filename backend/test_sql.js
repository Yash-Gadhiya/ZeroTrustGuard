const { sequelize } = require("./config/database");
const fs = require("fs");

async function run() {
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM accessrequests;");
    const [rows] = await sequelize.query("SELECT * FROM accessrequests;");
    const output = { cols, rows };
    fs.writeFileSync("test_output.json", JSON.stringify(output, null, 2));
    console.log("Written");
  } catch (err) {
    fs.writeFileSync("test_output.json", JSON.stringify({ error: err.message }, null, 2));
    console.log("Error Written");
  }
  process.exit(0);
}
run();
