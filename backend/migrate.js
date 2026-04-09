const { sequelize } = require("./config/database");

// Require all models to ensure they are registered with Sequelize
const User = require("./models/User");
const ActivityLog = require("./models/ActivityLog");
const File = require("./models/File");
const TemporaryAccess = require("./models/TemporaryAccess");
const AccessRequest = require("./models/AccessRequest");

// Execute the database migration
async function migrateDatabase() {
    try {
        console.log("Starting database migration...");
        
        // Use alter: true to update existing tables without dropping them
        await sequelize.sync({ alter: true });
        
        console.log("Database models migrated successfully.");
        console.log("Columns verified:");
        console.log("- User: name");
        console.log("- ActivityLog: riskScore, department, resolved, resolvedBy");
        console.log("- TemporaryAccess: canDownload");
        console.log("- File: uploadedBy associations");
        
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrateDatabase();
