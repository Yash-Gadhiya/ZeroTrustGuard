const { getMyFiles } = require('./controllers/fileController');
const User = require('./models/User');
const { connectDB } = require('./config/database');
const File = require('./models/File');
const TemporaryAccess = require('./models/TemporaryAccess');

async function test() {
  await connectDB();
  const user = await User.findOne({ where: { role: 'intern' } });
  
  if (!user) {
    console.log("No intern user found to test with");
    return;
  }

  const req = { user: { id: user.id, role: user.role } };
  
  const res = {
    status: (code) => {
      return {
        json: (data) => console.log("Status:", code, "Data:", data)
      };
    },
    json: (data) => console.log("Success:", data)
  };
  
  try {
    await getMyFiles(req, res);
  } catch(e) {
    console.error("Test script crashed", e);
  }
  process.exit();
}
test();
