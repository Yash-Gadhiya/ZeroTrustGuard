const { Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');

const sequelize = new Sequelize('zerotrust', 'postgres', 'Yash*1234', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false
});

async function run() {
  try {
    const [results] = await sequelize.query('SELECT password FROM "Users" WHERE email = \'admin@ztg.com\'');
    if (results.length > 0) {
      const hash = results[0].password;
      const isPasswordTxt = await bcrypt.compare('password.txt', hash);
      const isAdmin123 = await bcrypt.compare('admin123', hash);
      const isPassword = await bcrypt.compare('password', hash);
      const isPass = await bcrypt.compare('Password.txt', hash);
      
      console.log('Is "password.txt"?', isPasswordTxt);
      console.log('Is "admin123"?', isAdmin123);
      console.log('Is "password"?', isPassword);
      console.log('Is "Password.txt"?', isPass);
    } else {
      console.log("No admin found.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
