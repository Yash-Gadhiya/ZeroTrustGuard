const { connectDB, sequelize } = require('./config/database'); 
const WebScan = require('./models/WebScan');

async function check() {
  await connectDB();
  const scans = await WebScan.findAll();
  console.log("Found scans:", scans.length);
  process.exit();
}
check();
