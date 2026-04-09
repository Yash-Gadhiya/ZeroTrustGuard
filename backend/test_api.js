const axios = require('axios');
const fs = require('fs');
const jwt = require('jsonwebtoken');

(async () => {
    try {
        const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET || 'zerotrust_secret_key_2024', { expiresIn: '1h' });
        
        const res = await axios.get('http://localhost:5000/api/security/alerts', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        fs.writeFileSync('test_alerts.json', JSON.stringify(res.data, null, 2));
        console.log("Success");
    } catch(err) {
        fs.writeFileSync('test_alerts.json', JSON.stringify({ error: err.response?.data || err.message }, null, 2));
        console.log("Error");
    }
    process.exit();
})();
