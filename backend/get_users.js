const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('zerotrust', 'postgres', 'Yash*1234', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false
});

async function run() {
  try {
    const [results] = await sequelize.query('SELECT email FROM "Users"');
    console.log("Users:", results);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
