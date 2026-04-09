require('dotenv').config();
const { sequelize } = require('./config/database');
const File = require('./models/File');
const AccessRequest = require('./models/AccessRequest');
const TemporaryAccess = require('./models/TemporaryAccess');
const ActivityLog = require('./models/ActivityLog');

async function clearAll() {
  try {
    await sequelize.authenticate();
    console.log('DB connected.');

    // Delete related records first to avoid FK constraint errors
    const aDeleted = await TemporaryAccess.destroy({ where: {}, truncate: false });
    console.log(`Deleted ${aDeleted} TemporaryAccess records.`);

    const rDeleted = await AccessRequest.destroy({ where: {}, truncate: false });
    console.log(`Deleted ${rDeleted} AccessRequest records.`);

    // Clear file-related activity logs
    const lDeleted = await ActivityLog.destroy({
      where: { action: ['file_upload', 'file_download', 'file_view', 'access_request', 'access_granted', 'access_rejected'] }
    });
    console.log(`Deleted ${lDeleted} file-related ActivityLog records.`);

    const fDeleted = await File.destroy({ where: {}, truncate: false });
    console.log(`Deleted ${fDeleted} File records.`);

    console.log('✅ All file data cleared successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

clearAll();
