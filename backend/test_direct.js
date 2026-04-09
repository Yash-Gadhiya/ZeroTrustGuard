const fileController = require('./controllers/fileController');

const mockReq = {
  file: { filename: 'test.pdf', path: 'uploads/test.pdf' },
  user: { id: 1, role: 'staff' },
  body: { allowIntern: 'true', allowStaff: 'true', allowSenior: 'true', sensitivityLevel: 'low' },
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-runner' }
};

const mockRes = {
  status: (code) => {
    console.log("Status called with:", code);
    return {
      json: (data) => console.log("JSON called with:", data)
    };
  }
};

fileController.uploadFile(mockReq, mockRes).then(() => {
  console.log("Test finished.");
}).catch(err => {
  console.error("Test explicitly failed:", err);
});
