try {
  require('./controllers/securityController');
  require('fs').writeFileSync('test_syntax.txt', 'OK');
} catch (e) {
  require('fs').writeFileSync('test_syntax.txt', e.stack);
}
