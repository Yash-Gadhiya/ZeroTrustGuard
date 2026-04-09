const { connectDB } = require('./config/database');
const User = require('./models/User');

async function test() {
  await connectDB();
  const users = await User.findAll();
  console.log(users.map(u => ({ id: u.id, email: u.email, role: u.role, dept: u.department })));
  process.exit();
}
test();
