const { connectDB, sequelize } = require("./config/database");
const fs = require('fs');
const securityController = require('./controllers/securityController');

(async () => {
    try {
        await connectDB();
        
        const req = {
            user: { role: 'admin', id: 1 },
            query: {}
        };
        
        const res = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) {
                fs.writeFileSync('test_controller.json', JSON.stringify({ code: this.statusCode, data }, null, 2));
            }
        };

        await securityController.getAlerts(req, res);
    } catch(err) {
        fs.writeFileSync('test_controller.json', JSON.stringify({ error: err.stack }, null, 2));
    }
    process.exit();
})();
