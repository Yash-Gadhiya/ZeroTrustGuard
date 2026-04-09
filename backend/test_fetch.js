const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const token = jwt.sign({ id: 3, role: 'staff', email: 'it.staff1@ztg.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
console.log("Generated Token:", token);

// 1. Test getMyFiles
const getReq = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/files/my-files',
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + token }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log("FETCH Response:", res.statusCode, body));
});
getReq.end();

// 2. Test Upload (Multipart/form-data minimal mockup)
// Not doing upload yet, let's just observe fetch.
