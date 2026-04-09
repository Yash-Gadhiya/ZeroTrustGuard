const { connectDB, sequelize } = require("./config/database");
const AccessRequest = require("./models/AccessRequest");

async function check() {
  await connectDB();
  const reqs = await AccessRequest.findAll();
  console.log(JSON.stringify(reqs.map(r => r.toJSON()), null, 2));
  process.exit();
}
check();
