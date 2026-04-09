const { connectDB, sequelize } = require("./config/database");
const AccessRequest = require("./models/AccessRequest");
const fs = require('fs');

async function check() {
  try {
    await connectDB();
    await sequelize.sync({alter:true});
    const reqs = await AccessRequest.findAll();
    fs.writeFileSync('output_test.json', JSON.stringify(reqs.map(r => r.toJSON()), null, 2));
    console.log("SUCCESS");
  } catch(e) {
    fs.writeFileSync('output_test.json', e.stack);
    console.log("ERROR");
  }
  process.exit();
}
check();
