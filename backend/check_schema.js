const { sequelize } = require("./config/database");

async function check() {
  const [results] = await sequelize.query("SHOW COLUMNS FROM accessrequests;");
  console.log(results);
  process.exit();
}
check();
