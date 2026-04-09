const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const token = jwt.sign({ id: 3, role: 'staff', email: 'it.staff1@ztg.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/files/upload',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'multipart/form-data; boundary=' + boundary
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log("UPLOAD Response:", res.statusCode, body));
});

let payload = '';
payload += '--' + boundary + '\r\n';
payload += 'Content-Disposition: form-data; name="allowIntern"\r\n\r\n';
payload += 'true\r\n';
payload += '--' + boundary + '\r\n';
payload += 'Content-Disposition: form-data; name="file"; filename="test.txt"\r\n';
payload += 'Content-Type: text/plain\r\n\r\n';
payload += 'Hello world\r\n';
payload += '--' + boundary + '--\r\n';

req.write(payload);
req.end();
